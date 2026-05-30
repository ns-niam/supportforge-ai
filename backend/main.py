from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.llm import generate_answer
from pydantic import BaseModel, Field
from pypdf import PdfReader
from app.vector_store import add_document, search_documents
from pathlib import Path
from typing import Dict, List
from uuid import uuid4
from datetime import datetime, timezone
import shutil
import os
import re
from pathlib import Path
from dotenv import load_dotenv
from typing import Dict, List, Optional
from app.memory import conversation_memory

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

app = FastAPI(
    title="SupportForge AI",
    description="AI Customer Support & Knowledge Assistant Platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

documents_store: Dict[str, dict] = {}


class SourceItem(BaseModel):
    filename: str
    chunk_index: int
    score: float


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    status: str = "success"
    provider: str = "none"
    session_id: Optional[str] = None
    sources: List[SourceItem] = Field(default_factory=list)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_text(text: str) -> str:
    if not text:
        return ""
    text = text.replace("\x00", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_text_from_pdf(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    parts: List[str] = []

    for page in reader.pages:
        page_text = page.extract_text() or ""
        page_text = clean_text(page_text)
        if page_text:
            parts.append(page_text)

    return "\n".join(parts).strip()


def split_text(text: str, chunk_size: int = 800, chunk_overlap: int = 120) -> List[str]:
    if not text.strip():
        return []

    chunks: List[str] = []
    start = 0
    text_length = len(text)

    while start < text_length:
        end = min(start + chunk_size, text_length)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= text_length:
            break

        start = max(0, end - chunk_overlap)

    return chunks


def score_chunk(chunk: str, query: str) -> int:
    chunk_lower = chunk.lower()
    score = 0

    for token in re.findall(r"\w+", query.lower()):
        if len(token) < 2:
            continue
        if token in chunk_lower:
            score += 1

    return score


def retrieve_relevant_chunks(query: str, top_k: int = 3) -> List[str]:
    all_chunks = []

    for doc in documents_store.values():
        for idx, chunk in enumerate(doc["chunks"]):
            all_chunks.append(
                {
                    "document_id": doc["document_id"],
                    "filename": doc["filename"],
                    "chunk_index": idx,
                    "chunk": chunk,
                }
            )

    if not all_chunks:
        return []

    ranked = sorted(all_chunks, key=lambda item: score_chunk(item["chunk"], query), reverse=True)
    filtered = [item for item in ranked if score_chunk(item["chunk"], query) > 0]

    if not filtered:
        return []

    return [
        f"[{item['filename']} | chunk {item['chunk_index'] + 1}] {item['chunk']}"
        for item in filtered[:top_k]
    ]


@app.get("/")
def root():
    return {
        "message": "SupportForge AI Backend is running",
        "version": "0.1.0",
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "SupportForge AI",
        "documents_loaded": len(documents_store),
    }


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    try:
        session = conversation_memory.get_or_create_session(request.session_id)

        # Store the user message first, so the conversation memory stays useful
        # even if the provider falls back or fails later.
        conversation_memory.add_message(session.session_id, "user", request.message)

        relevant_chunks = search_documents(request.message, top_k=3)

        context_parts = []

        memory_context = conversation_memory.build_context(session.session_id, limit=6)
        if memory_context:
            context_parts.append(memory_context)

        if relevant_chunks:
            documents_context = "\n\n".join(
                f"[{item['filename']} | chunk {item['chunk_index'] + 1}] {item['chunk']}"
                for item in relevant_chunks
            )
            context_parts.append(f"Document Context:\n{documents_context}")

        combined_context = "\n\n".join(context_parts).strip()

        result = generate_answer(request.message, combined_context)

        conversation_memory.add_message(
            session.session_id,
            "assistant",
            result["answer"],
        )

        sources = [
            SourceItem(
                filename=item["filename"],
                chunk_index=item["chunk_index"],
                score=item["score"],
            )
            for item in relevant_chunks
        ]

        return ChatResponse(
            reply=result["answer"],
            status=result["status"],
            provider=result["provider"],
            session_id=session.session_id,
            sources=sources,
        )

    except Exception as error:
        return ChatResponse(
            reply=f"Backend error: {str(error)}",
            status="error",
            provider="none",
            session_id=request.session_id,
            sources=[],
        )

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    document_id = str(uuid4())
    safe_filename = f"{document_id}_{file.filename}"
    file_path = UPLOAD_DIR / safe_filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    extracted_text = extract_text_from_pdf(file_path)
    chunks = split_text(extracted_text)
    indexed_chunks = add_document(document_id, file.filename, chunks)

    documents_store[document_id] = {
        "document_id": document_id,
        "filename": file.filename,
        "stored_filename": safe_filename,
        "file_path": str(file_path),
        "uploaded_at": utc_now_iso(),
        "characters": len(extracted_text),
        "chunks": chunks,
        "preview": extracted_text[:500],
    }

    return {
    "status": "success",
    "document_id": document_id,
    "filename": file.filename,
    "characters": len(extracted_text),
    "total_chunks": len(chunks),
    "indexed_chunks": indexed_chunks,
    "preview": extracted_text[:500],
    }


@app.get("/api/documents")
def list_documents():
    items = []

    for doc in documents_store.values():
        items.append(
            {
                "document_id": doc["document_id"],
                "filename": doc["filename"],
                "uploaded_at": doc["uploaded_at"],
                "characters": doc["characters"],
                "total_chunks": len(doc["chunks"]),
                "preview": doc["preview"][:200],
            }
        )

    return {
        "count": len(items),
        "documents": items,
    }


@app.get("/api/documents/{document_id}")
def get_document(document_id: str):
    doc = documents_store.get(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return {
        "document_id": doc["document_id"],
        "filename": doc["filename"],
        "uploaded_at": doc["uploaded_at"],
        "characters": doc["characters"],
        "total_chunks": len(doc["chunks"]),
        "preview": doc["preview"],
        "chunks": doc["chunks"],
    }


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: str):
    doc = documents_store.get(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = doc.get("file_path")
    if file_path and os.path.exists(file_path):
        os.remove(file_path)

    del documents_store[document_id]

    return {
        "status": "success",
        "message": "Document deleted successfully",
        "document_id": document_id,
    }