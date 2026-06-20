create extension if not exists vector;

create type public.transcript_status as enum (
    'pending',
    'processing',
    'ready',
    'failed',
    'unsupported'
);

create table if not exists public.source_transcript (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    uploaded_file_id uuid not null references public.uploaded_file (id) on delete cascade,
    status public.transcript_status not null default 'pending',
    extraction_method text,
    plain_text text,
    total_tokens_estimate integer,
    error_message text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint source_transcript_file_unique unique (uploaded_file_id)
);

create table if not exists public.source_transcript_chunk (
    id uuid primary key default gen_random_uuid(),
    transcript_id uuid not null references public.source_transcript (id) on delete cascade,
    project_id uuid not null references public.project (id) on delete cascade,
    chunk_index integer not null,
    chunk_text text not null,
    embedding vector(768),
    created_at timestamptz not null default timezone('utc', now()),
    constraint source_transcript_chunk_order unique (transcript_id, chunk_index)
);

create index if not exists source_transcript_project_status_idx
    on public.source_transcript (project_id, status);

create index if not exists source_transcript_uploaded_file_idx
    on public.source_transcript (uploaded_file_id);

create index if not exists source_transcript_chunk_transcript_idx
    on public.source_transcript_chunk (transcript_id, chunk_index);

create index if not exists source_transcript_chunk_project_idx
    on public.source_transcript_chunk (project_id);

create index if not exists source_transcript_chunk_embedding_idx
    on public.source_transcript_chunk
    using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

create or replace function public.match_source_transcripts(
    p_project_id uuid,
    query_embedding vector(768),
    match_count int default 5,
    similarity_threshold float default 0.3
)
returns table (
    chunk_id uuid,
    transcript_id uuid,
    uploaded_file_id uuid,
    chunk_text text,
    chunk_index int,
    similarity float
)
language sql
stable
as $$
    select
        c.id as chunk_id,
        c.transcript_id,
        t.uploaded_file_id,
        c.chunk_text,
        c.chunk_index,
        1 - (c.embedding <=> query_embedding) as similarity
    from public.source_transcript_chunk c
    join public.source_transcript t on t.id = c.transcript_id
    where t.project_id = p_project_id
      and t.status = 'ready'
      and c.embedding is not null
      and 1 - (c.embedding <=> query_embedding) >= similarity_threshold
    order by c.embedding <=> query_embedding
    limit greatest(match_count, 1);
$$;

revoke all on table public.source_transcript from anon, authenticated;
revoke all on table public.source_transcript_chunk from anon, authenticated;

alter table public.source_transcript enable row level security;
alter table public.source_transcript_chunk enable row level security;
