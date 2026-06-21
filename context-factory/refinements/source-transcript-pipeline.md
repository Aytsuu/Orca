# Source Transcript Pipeline

**Status:** Approved — awaiting implementation  
**Decisions locked:** separate queue, shared LLM budget, no agent pipeline trigger on upload

---

## Goal

Transcribe uploaded source files into searchable text at upload time, store chunked embeddings in pgvector, and retrieve relevant chunks semantically during AI pipeline runs — replacing the current raw-file injection in `ContextBuilder` that would exhaust token budgets immediately.

---

## Approved Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Queue separation | **Separate** — `orca-transcripts` worker, independent of `orca-agent-pipeline` |
| 2 | LLM budget for transcription | **Shared** — uses same `daily_llm_budget_per_project` guard |
| 3 | `AssembledContext.files` fate | **Replace** — rename to `transcript_chunks`, update all references (see audit below) |
| 4 | Agent pipeline trigger on upload | **Transcript fires immediately at upload** — `enqueue_transcription()` is called as soon as the file row is created. No chat message is needed. `trigger_agents()` (the AI planning pipeline) is NOT called at all for source uploads. |

---

## Current State Audit

### `context.files` touch points (all must be updated)

| File | Line | What it does |
|---|---|---|
| [`context/builder.py:20`](file:///d:/Orca/ai_engine/src/context/builder.py#L20) | `files: list[dict[str, Any]]` | `AssembledContext` field declaration |
| [`context/builder.py:47`](file:///d:/Orca/ai_engine/src/context/builder.py#L47) | `files = await self._get_files(...)` | Populates from `uploaded_file` table by explicit IDs |
| [`context/builder.py:54`](file:///d:/Orca/ai_engine/src/context/builder.py#L54) | `"files": files` | Included in token estimate dict |
| [`context/builder.py:68`](file:///d:/Orca/ai_engine/src/context/builder.py#L68) | `files=files` | Assigned to `AssembledContext` |
| [`agents/steps.py:86`](file:///d:/Orca/ai_engine/src/agents/steps.py#L86) | `"files": _strip_non_citation_ids(context.files)` | Injected into prompt context blob |
| [`pipelines/runner.py:355`](file:///d:/Orca/ai_engine/src/pipelines/runner.py#L355) | `not context.files` | Gate: skip pipeline if no messages AND no files |

### Current `_get_files` behaviour (to be removed)

Fetches `storage_path` + `mime_type` by explicit `file_ids` from the triggering `agent_run`. Sends raw storage references into LLM context — no text content, no chunking. This is the token-unsafe path being eliminated.

### Current `chat/router.py` upload trigger (to be changed)

`create_uploaded_file_endpoint` currently calls `trigger_agents()` when `uploaded_file["is_ai_context"] == True`. This will be **removed entirely** and replaced with an immediate `enqueue_transcription()` call — but **only when `purpose == 'source'`**. `purpose` is the primary field; `is_ai_context` is derived from it and is not used as a gate. Files with `purpose = 'chat'` are never processed through the transcript pipeline. Transcript generation does not wait for any chat message to be sent.

---

## Architecture

```
POST /{project_id}/files  (purpose='source')
  │
  ├── create_uploaded_file() → DB row (uploaded_file)
  │
  ├── [REMOVED] trigger_agents() ← no longer called for source uploads
  │
  └── TranscriptQueueProducer.enqueue_transcription(uploaded_file_id, project_id)
        │  queue: orca-transcripts (separate worker)
        │
        └── transcribe_source_file_job(uploaded_file_id, project_id)
              │
              ├── 1. Download bytes from Supabase Storage
              ├── 2. TranscriptExtractor.extract(bytes, mime_type)
              │       → ExtractionResult(text, method)
              ├── 3. chunk_text(text, max_tokens=400, overlap=50)
              │       → list[str]
              ├── 4. GeminiEmbedder.embed_batch(chunks)
              │       → list[list[float]]  (text-embedding-004, dim=768)
              └── 5. Store → source_transcript + source_transcript_chunk rows


Agent pipeline run (triggered separately, by messages only):
  │
  └── ContextBuilder.build()
        │
        ├── _get_messages()           (unchanged)
        ├── _get_memory()             (unchanged)
        ├── _get_summaries()          (unchanged)
        ├── _get_transcript_chunks()  (replaces _get_files)
        │     │
        │     ├── embed query messages → vector(768)
        │     └── match_source_transcripts RPC (pgvector cosine)
        │           → top-K ready chunks as plain text strings
        │
        └── _get_source_manifest()   (NEW — Option B)
              │
              └── SELECT id, filename, extraction_method, plain_text[:200], created_at
                  FROM source_transcript WHERE project_id=? AND status='ready'
                  → lightweight list injected as "available_sources" in context
```

---

## Extraction Strategy by MIME Type

| MIME group | Method | Library | Notes |
|---|---|---|---|
| `application/pdf` | Page-by-page text extraction | `pypdf` | Pure Python, no system deps |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Paragraphs + tables | `python-docx` | Preserves structure |
| `text/plain`, `text/markdown`, `text/csv` | Direct UTF-8 decode | stdlib | Fallback encoding detection |
| `audio/*` | Gemini Files API — audio modality | `google-genai` | Speech-to-text; free-tier supported; counts toward RPM |
| `video/*` ≤ 15 min | Gemini Files API — video modality (audio + visual frames) | `google-genai` | Captures both speech AND on-screen content (slides, diagrams, screens); ~258 tokens/sec — budget-intensive |
| `video/*` > 15 min | Rejected — `transcript_status = unsupported` | — | ~231,600+ tokens for video alone exceeds safe budget; no `ffmpeg` dependency introduced |
| `image/*` | Gemini vision prompt: *"Describe all visible content including any text"* | `google-genai` | 1 LLM call per image; counts toward daily budget |
| Unknown / unsupported | Skip | — | Sets `transcript_status = unsupported`, no error raised |

### Video-specific constraints

- **Duration limit:** 15 minutes hard cap. The extractor must inspect video metadata before uploading to the Gemini Files API. Files exceeding the limit are marked `unsupported` immediately — no partial processing.
- **Why 15 min:** Gemini tokenises video at ~258 tokens/second. A 15-minute clip = ~232,200 tokens for the video alone, before the prompt. Beyond that the model may truncate or exceed free-tier limits.
- **What Gemini sees in video:** Both the audio track (speech, discussion) and sampled visual frames (slides, shared screens, whiteboards, diagrams). For planning workspace use cases this is more valuable than audio alone.
- **No `ffmpeg`:** The plan explicitly avoids this system dependency. If audio-only extraction from long videos is needed in future, that is a separate implementation decision.
- **48h TTL:** Video files uploaded to the Gemini Files API expire after 48 hours. The extractor deletes the remote file immediately after the transcript is generated — do not rely on the remote file being available after the job completes.
- **Retry behaviour:** If the Gemini video job fails (network error, quota), set `status = failed` and store `error_message`. The job can be retried by re-enqueuing — the extractor checks for an existing `processing` row and upserts.


---

## Database Migration

### New file: `supabase/migrations/YYYYMMDD_source_transcripts.sql`

```sql
-- Requires pgvector extension
create extension if not exists vector;

create type public.transcript_status as enum (
    'pending', 'processing', 'ready', 'failed', 'unsupported'
);

-- One transcript per source file
create table if not exists public.source_transcript (
    id                    uuid primary key default gen_random_uuid(),
    project_id            uuid not null references public.project (id) on delete cascade,
    uploaded_file_id      uuid not null references public.uploaded_file (id) on delete cascade,
    status                public.transcript_status not null default 'pending',
    extraction_method     text,
    plain_text            text,
    total_tokens_estimate integer,
    error_message         text,
    created_at            timestamptz not null default timezone('utc', now()),
    updated_at            timestamptz not null default timezone('utc', now()),
    constraint source_transcript_file_unique unique (uploaded_file_id)
);

-- Chunks with embeddings
create table if not exists public.source_transcript_chunk (
    id            uuid primary key default gen_random_uuid(),
    transcript_id uuid not null references public.source_transcript (id) on delete cascade,
    project_id    uuid not null references public.project (id) on delete cascade,
    chunk_index   integer not null,
    chunk_text    text not null,
    embedding     vector(768),
    created_at    timestamptz not null default timezone('utc', now()),
    constraint source_transcript_chunk_order unique (transcript_id, chunk_index)
);

-- IVFFlat index for cosine similarity (tune lists= after data grows)
create index if not exists source_transcript_chunk_embedding_idx
    on public.source_transcript_chunk
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

-- Indexes
create index if not exists source_transcript_project_status_idx
    on public.source_transcript (project_id, status);
create index if not exists source_transcript_chunk_transcript_idx
    on public.source_transcript_chunk (transcript_id, chunk_index);

-- Semantic search RPC
create or replace function match_source_transcripts(
    p_project_id         uuid,
    query_embedding      vector(768),
    match_count          int     default 5,
    similarity_threshold float   default 0.3
)
returns table (
    chunk_id        uuid,
    transcript_id   uuid,
    uploaded_file_id uuid,
    chunk_text      text,
    chunk_index     int,
    similarity      float
)
language sql stable
as $$
    select
        c.id                as chunk_id,
        c.transcript_id,
        t.uploaded_file_id,
        c.chunk_text,
        c.chunk_index,
        1 - (c.embedding <=> query_embedding) as similarity
    from public.source_transcript_chunk c
    join public.source_transcript t on t.id = c.transcript_id
    where t.project_id = p_project_id
      and t.status = 'ready'
      and 1 - (c.embedding <=> query_embedding) >= similarity_threshold
    order by c.embedding <=> query_embedding
    limit match_count;
$$;

-- RLS (same pattern as rest of schema)
alter table public.source_transcript enable row level security;
alter table public.source_transcript_chunk enable row level security;
revoke all on table public.source_transcript from anon, authenticated;
revoke all on table public.source_transcript_chunk from anon, authenticated;
```

---

## New Modules

### `ai_engine/src/transcription/`

```
transcription/
  __init__.py
  extractor.py      # MIME → text, raises UnsupportedMimeType for unknown
  chunker.py        # chunk_text(text, max_tokens=400, overlap=50) → list[str]
  embedder.py       # GeminiEmbedder wrapping text-embedding-004
  service.py        # Orchestrator: extract → chunk → embed → store
```

**`extractor.py`**
```python
@dataclass
class ExtractionResult:
    text: str
    method: str  # "pdf" | "docx" | "plaintext" | "gemini_vision" | "gemini_audio" | "gemini_video"

class UnsupportedMimeType(Exception): ...
class VideoTooLong(Exception): ...  # raised when video duration > VIDEO_MAX_DURATION_SECONDS

class TranscriptExtractor:
    async def extract(self, file_bytes: bytes, mime_type: str) -> ExtractionResult
    # Dispatches by mime_type prefix:
    #   audio/*         → GeminiFileExtractor (audio modality)
    #   video/*         → check duration first; if ≤ limit → GeminiFileExtractor (video modality)
    #                     if > limit → raises VideoTooLong → caller sets status=unsupported
    #   image/*         → GeminiVisionExtractor
    #   pdf/docx/text   → local extraction, no LLM call
```

**`chunker.py`**
```python
def chunk_text(text: str, max_tokens: int = 400, overlap: int = 50) -> list[str]:
    # Splits on sentence boundaries, respects max_tokens estimate (~4 chars/token)
    # Returns [] for empty/whitespace-only text
```

**`embedder.py`**
```python
class GeminiEmbedder:
    async def embed_batch(self, texts: list[str]) -> list[list[float]]
    # Uses models/text-embedding-004, task_type=RETRIEVAL_DOCUMENT
    # Respects daily_llm_budget_per_project (increments project usage counter)
```

**`service.py`**
```python
async def transcribe_uploaded_file(
    supabase: AsyncClient,
    *,
    project_id: str,
    uploaded_file_id: str,
) -> None:
    # 1. Insert source_transcript row (status=processing)
    # 2. Download file from storage
    # 3. Extract text (sets status=unsupported on UnsupportedMimeType)
    # 4. Chunk text
    # 5. Embed chunks (respects budget)
    # 6. Bulk insert source_transcript_chunk rows
    # 7. Update source_transcript (status=ready, plain_text, extraction_method)
    # On any error: status=failed, error_message stored
```

---

## Modified Files

### `ai_engine/src/tasks/worker.py`

Add alongside `run_project_pipeline_job`:

```python
async def _run_transcription(uploaded_file_id: str, project_id: str) -> None:
    supabase = await get_supabase_admin()
    await transcribe_uploaded_file(
        supabase,
        project_id=project_id,
        uploaded_file_id=uploaded_file_id,
    )

def transcribe_source_file_job(uploaded_file_id: str, project_id: str) -> None:
    asyncio.run(_run_transcription(uploaded_file_id, project_id))
```

Worker reads from `orca-transcripts` queue (separate process from `orca-agent-pipeline`).

---

### `ai_engine/src/context/retrieval.py`

Add:

```python
class SemanticTranscriptRetrievalStrategy:
    def __init__(self, supabase: AsyncClient, embedder: GeminiEmbedder) -> None: ...

    async def retrieve(
        self,
        project_id: str,
        query_messages: list[dict],
        limit: int = 5,
        similarity_threshold: float = 0.3,
    ) -> list[dict]:
        # 1. Concatenate message content
        # 2. embedder.embed_batch([query_text]) → query_vector
        # 3. Call match_source_transcripts RPC
        # 4. Return list of {chunk_text, similarity, uploaded_file_id, chunk_index}
```

---

### `ai_engine/src/context/builder.py`

```python
# BEFORE
@dataclass
class AssembledContext:
    ...
    files: list[dict[str, Any]]

# AFTER
@dataclass
class AssembledContext:
    ...
    transcript_chunks: list[dict[str, Any]]  # replaces files — semantically retrieved chunks
    source_manifest: list[dict[str, Any]]    # NEW — lightweight metadata for all ready sources
```

**`source_manifest` shape** (per entry, minimal tokens):
```python
{
    "filename": "requirements-v2.pdf",
    "extraction_method": "pdf",         # how it was transcribed
    "preview": "This document outlines the API endpoints...",  # first 200 chars of plain_text
    "uploaded_at": "2026-06-21T04:00:00Z",
    "chunks_available": 12,             # count of stored chunks
}
```

**Why this matters:** agents see both *what was retrieved* (matching chunks) and *what exists* (the manifest). If a source file exists but none of its chunks matched the current messages' embedding, the agent knows it exists and can surface a gap like: *"source file 'requirements-v2.pdf' is available but no content was retrieved — the current discussion may need explicit reference to it."*

- Remove `_get_files()` method entirely
- Add `_get_transcript_chunks(project_id)` using `SemanticTranscriptRetrievalStrategy`
- Add `_get_source_manifest(project_id)` — plain DB query, no embedding call, ~1 row per source file
- Update token estimate dict: `"transcript_chunks"` + `"source_manifest"` instead of `"files"`
- `file_ids` parameter removed from `build()` — retrieval is query-driven, not ID-driven

---

### `ai_engine/src/agents/steps.py`

```python
# BEFORE (line 86)
"files": _strip_non_citation_ids(context.files),

# AFTER — two distinct keys in the context blob:
"transcript_chunks": [chunk["chunk_text"] for chunk in context.transcript_chunks],
# ^ semantically retrieved content — directly relevant to current messages

"available_sources": [
    {
        "filename": s["filename"],
        "preview": s["preview"],
        "extraction_method": s["extraction_method"],
        "chunks_retrieved": sum(
            1 for c in context.transcript_chunks
            if c.get("uploaded_file_id") == s.get("uploaded_file_id")
        ),
    }
    for s in context.source_manifest
],
# ^ manifest of ALL ready sources — lets agents know what files exist even if
#   none of their chunks landed in transcript_chunks for this run.
#   chunks_retrieved=0 signals a coverage gap the agent can surface.
```

---

### `ai_engine/src/pipelines/runner.py`

```python
# BEFORE (line 355)
if not meaningful_messages and not ambiguous_messages and not context.files:

# AFTER
if not meaningful_messages and not ambiguous_messages and not context.transcript_chunks:
```

Also: remove `file_ids=run.get("new_file_ids", [])` from `builder.build()` call — no longer needed.

---

### `api/src/chat/router.py`

```python
# BEFORE
if uploaded_file["is_ai_context"]:
    await trigger_agents(
        supabase, queue_producer,
        project_id=str(project_id),
        triggered_by=project_context["session_id"],
        file_ids=[uploaded_file["id"]],
    )

# AFTER
# purpose is the single source of truth — is_ai_context is derived from it and not checked.
# Transcript fires immediately on upload; no chat message trigger needed.
if uploaded_file["purpose"] == "source":
    transcript_producer.enqueue_transcription(
        uploaded_file_id=uploaded_file["id"],
        project_id=str(project_id),
    )
# trigger_agents() is NOT called for any file upload
# chat attachments (purpose='chat') are silently skipped
```

---

### `api/src/config.py` + `ai_engine/src/config.py`

Add:

```python
transcript_queue_name: str = Field(default="orca-transcripts", alias="TRANSCRIPT_QUEUE_NAME")
transcript_queue_timeout_seconds: int = Field(default=600, alias="TRANSCRIPT_QUEUE_TIMEOUT_SECONDS")
embedding_model: str = Field(default="models/text-embedding-004", alias="EMBEDDING_MODEL")
transcript_chunk_max_tokens: int = Field(default=400, alias="TRANSCRIPT_CHUNK_MAX_TOKENS")
transcript_chunk_overlap_tokens: int = Field(default=50, alias="TRANSCRIPT_CHUNK_OVERLAP_TOKENS")
transcript_similarity_threshold: float = Field(default=0.3, alias="TRANSCRIPT_SIMILARITY_THRESHOLD")
transcript_top_k: int = Field(default=5, alias="TRANSCRIPT_TOP_K")
```

---

### `api/src/transcription/queue.py` (new)

```python
class TranscriptQueueProducer:
    def enqueue_transcription(
        self,
        uploaded_file_id: str,
        project_id: str,
    ) -> str | None:
        # Enqueues transcribe_source_file_job on orca-transcripts queue
        # Same RQ pattern as RqQueueProducer.enqueue_run()
```

---

## New Dependencies

```
# ai_engine/requirements.txt additions
pypdf>=4.0
python-docx>=1.1
# google-genai already present for LLM — text-embedding-004 uses same SDK
```

---

## Verification Plan

### Unit Tests

| Test | Fixture |
|---|---|
| `extractor.py` — PDF text extraction | Small fixture PDF with known text |
| `extractor.py` — DOCX extraction | Fixture .docx with paragraphs + table |
| `extractor.py` — plaintext decode | UTF-8 and latin-1 fixture files |
| `extractor.py` — unsupported MIME → `UnsupportedMimeType` | `application/octet-stream` |
| `chunker.py` — chunk boundaries at max_tokens | 1000-word text, assert chunk count |
| `chunker.py` — overlap correctness | Check last N tokens of chunk N appear in chunk N+1 |
| `chunker.py` — empty/whitespace → `[]` | Empty string |
| `embedder.py` — batch embed with mocked Gemini client | Assert output shape `[n_chunks][768]` |
| `SemanticTranscriptRetrievalStrategy` — RPC mock | Assert top-K ordering, threshold filter |
| `_get_source_manifest()` — returns all ready transcripts | 2 ready + 1 pending → assert only 2 returned |
| `_get_source_manifest()` — preview truncated at 200 chars | Long `plain_text` → assert `preview` length ≤ 200 |
| `_build_reasoning_context()` — manifest injected | Assert `available_sources` present in context dict |
| `_build_reasoning_context()` — `chunks_retrieved` count | Source with no matching chunks → `chunks_retrieved=0` |

### Integration Tests

- Upload PDF → assert `source_transcript.status = 'ready'` + chunks exist with non-null embeddings
- Upload image → assert `extraction_method = 'gemini_vision'`, chunk text non-empty
- Upload `.exe` → assert `status = 'unsupported'`, no chunks inserted
- Agent pipeline run → assert `AssembledContext.transcript_chunks` non-empty when ready transcript exists
- Agent pipeline run → assert `AssembledContext.source_manifest` includes all `ready` transcripts for the project, including ones whose chunks did not match the current messages
- `available_sources` in context blob → assert entry with `chunks_retrieved=0` present when a source exists but nothing matched

### Manual Smoke Test

1. Upload a PDF via the web UI
2. Confirm `source_transcript` row in Supabase → `status = ready`
3. Confirm `source_transcript_chunk` rows with embeddings
4. Post a chat message referencing content from the PDF
5. Confirm pipeline run includes matching transcript chunks in assembled context
6. Confirm `agent_run.new_file_ids` is still populated but NOT used by `ContextBuilder`

---

## Notes

- `agent_run.new_file_ids` column is kept for audit trail but `ContextBuilder` no longer reads it
- First agent run after a large upload may see zero transcript chunks if transcription hasn't completed — this is acceptable; transcripts accumulate for all future runs
- `plain_text` column on `source_transcript` serves as a fallback / debug surface; it is not injected into context directly
- Audio files via Gemini Files API: uploaded to Gemini File storage (ephemeral, 48h TTL), referenced in prompt, deleted immediately after transcript is stored
- Video files via Gemini Files API: same lifecycle as audio, but Gemini reads both the audio track and visual frames — ideal for meeting recordings, Loom walkthroughs, and screen-share sessions containing slides or diagrams
- Video > 15 min: rejected at extraction time with `status = unsupported`; no partial transcription is attempted
- Add `VIDEO_MAX_DURATION_SECONDS` (default `900`) to `ai_engine/src/config.py` so the limit is configurable without a code change
