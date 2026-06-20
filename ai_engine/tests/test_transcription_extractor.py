from __future__ import annotations

import sys
import types
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pytest

from src.transcription.extractor import TranscriptExtractor, UnsupportedMimeType, VideoTooLong


def _build_simple_pdf(text: str) -> bytes:
    stream = f"BT\n/F1 18 Tf\n50 100 Td\n({text}) Tj\nET\n".encode("utf-8")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] "
            b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
        ),
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    chunks = [b"%PDF-1.4\n"]
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(sum(len(chunk) for chunk in chunks))
        chunks.append(f"{index} 0 obj\n".encode("ascii"))
        chunks.append(obj)
        chunks.append(b"\nendobj\n")

    xref_offset = sum(len(chunk) for chunk in chunks)
    chunks.append(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    chunks.append(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        chunks.append(f"{offset:010d} 00000 n \n".encode("ascii"))
    chunks.append(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )
    return b"".join(chunks)


def _build_simple_docx(paragraphs: list[str], table_rows: list[list[str]]) -> bytes:
    document_xml = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
        "<w:body>",
    ]
    for paragraph in paragraphs:
        document_xml.append(f"<w:p><w:r><w:t>{paragraph}</w:t></w:r></w:p>")
    if table_rows:
        document_xml.append("<w:tbl>")
        for row in table_rows:
            document_xml.append("<w:tr>")
            for cell in row:
                document_xml.append(f"<w:tc><w:p><w:r><w:t>{cell}</w:t></w:r></w:p></w:tc>")
            document_xml.append("</w:tr>")
        document_xml.append("</w:tbl>")
    document_xml.extend(["<w:sectPr/>", "</w:body>", "</w:document>"])

    buffer = BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            (
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
"""
            ),
        )
        archive.writestr(
            "_rels/.rels",
            (
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>
"""
            ),
        )
        archive.writestr(
            "word/_rels/document.xml.rels",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>
""",
        )
        archive.writestr("word/document.xml", "".join(document_xml))
    return buffer.getvalue()


@pytest.mark.asyncio
async def test_transcript_extractor_extracts_text_from_pdf() -> None:
    extractor = TranscriptExtractor()

    result = await extractor.extract(_build_simple_pdf("Hello PDF"), "application/pdf")

    assert result.method == "pdf"
    assert "Hello PDF" in result.text


@pytest.mark.asyncio
async def test_transcript_extractor_extracts_text_from_docx_paragraphs_and_tables() -> None:
    extractor = TranscriptExtractor()
    file_bytes = _build_simple_docx(
        ["First paragraph", "Second paragraph"],
        [["Owner", "Jan"], ["Priority", "High"]],
    )

    result = await extractor.extract(
        file_bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    assert result.method == "docx"
    assert "First paragraph" in result.text
    assert "Second paragraph" in result.text
    assert "Owner" in result.text
    assert "High" in result.text


@pytest.mark.asyncio
async def test_transcript_extractor_decodes_plaintext_with_fallback_encoding() -> None:
    extractor = TranscriptExtractor()
    file_bytes = "caf\xe9 roadmap".encode("latin-1")

    result = await extractor.extract(file_bytes, "text/plain")

    assert result.method == "plaintext"
    assert result.text == "caf\xe9 roadmap"


@pytest.mark.asyncio
async def test_transcript_extractor_rejects_unsupported_mime_types() -> None:
    extractor = TranscriptExtractor()

    with pytest.raises(UnsupportedMimeType):
        await extractor.extract(b"MZ", "application/octet-stream")


class FakeResponse:
    def __init__(self, text: str) -> None:
        self.text = text


class FakeModels:
    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.calls: list[dict[str, object]] = []

    async def generate_content(self, *, model: str, contents: list[object]) -> FakeResponse:
        self.calls.append({"model": model, "contents": contents})
        return FakeResponse(self.response_text)


class FakeFileState:
    def __init__(self, name: str) -> None:
        self.name = name


class FakeUploadedFile:
    def __init__(self, *, name: str, state: str, video_duration: str | None = None) -> None:
        self.name = name
        self.state = FakeFileState(state)
        if video_duration is not None:
            self.video_metadata = types.SimpleNamespace(video_duration=video_duration)


class FakeFiles:
    def __init__(self, uploaded_file: FakeUploadedFile) -> None:
        self.uploaded_file = uploaded_file
        self.upload_calls: list[str] = []
        self.get_calls: list[str] = []
        self.delete_calls: list[str] = []

    async def upload(self, *, file: str) -> FakeUploadedFile:
        self.upload_calls.append(file)
        return self.uploaded_file

    async def get(self, *, name: str) -> FakeUploadedFile:
        self.get_calls.append(name)
        return self.uploaded_file

    async def delete(self, *, name: str) -> None:
        self.delete_calls.append(name)


class FakeAsyncClient:
    def __init__(
        self, *, response_text: str, uploaded_file: FakeUploadedFile | None = None
    ) -> None:
        self.models = FakeModels(response_text)
        self.files = FakeFiles(uploaded_file or FakeUploadedFile(name="file-1", state="ACTIVE"))


class FakePart:
    @classmethod
    def from_bytes(cls, *, data: bytes, mime_type: str) -> dict[str, object]:
        return {"data": data, "mime_type": mime_type}


@pytest.fixture(autouse=True)
def fake_google_genai_types(monkeypatch):
    fake_genai_module = types.SimpleNamespace(types=types.SimpleNamespace(Part=FakePart))
    fake_google_module = sys.modules.get("google")
    monkeypatch.setitem(sys.modules, "google.genai", fake_genai_module)
    if fake_google_module is None:
        monkeypatch.setitem(sys.modules, "google", types.SimpleNamespace(genai=fake_genai_module))
    else:
        monkeypatch.setattr(fake_google_module, "genai", fake_genai_module, raising=False)


@pytest.mark.asyncio
async def test_transcript_extractor_uses_inline_gemini_for_images() -> None:
    async_client = FakeAsyncClient(response_text="Visible slide text")
    extractor = TranscriptExtractor(async_client=async_client)

    result = await extractor.extract(b"\x89PNG", "image/png")

    assert result.method == "gemini_vision"
    assert result.text == "Visible slide text"
    assert (
        async_client.models.calls[0]["contents"][1]
        == "Describe all visible content including any text."
    )


@pytest.mark.asyncio
async def test_transcript_extractor_uses_uploaded_file_flow_for_audio() -> None:
    uploaded_file = FakeUploadedFile(name="audio-1", state="ACTIVE")
    async_client = FakeAsyncClient(response_text="Audio transcript", uploaded_file=uploaded_file)
    extractor = TranscriptExtractor(async_client=async_client)

    result = await extractor.extract(b"ID3", "audio/mpeg")

    assert result.method == "gemini_audio"
    assert result.text == "Audio transcript"
    assert async_client.files.upload_calls
    assert async_client.files.delete_calls == ["audio-1"]
    assert async_client.models.calls[0]["contents"][1] == "Transcribe the audio as plain text."


@pytest.mark.asyncio
async def test_transcript_extractor_rejects_videos_over_duration_limit() -> None:
    uploaded_file = FakeUploadedFile(name="video-1", state="ACTIVE", video_duration="901s")
    async_client = FakeAsyncClient(response_text="Video transcript", uploaded_file=uploaded_file)
    extractor = TranscriptExtractor(async_client=async_client, video_max_duration_seconds=900)

    with pytest.raises(VideoTooLong):
        await extractor.extract(b"\x00\x00\x00\x18ftypmp42", "video/mp4")

    assert async_client.files.delete_calls == ["video-1"]
