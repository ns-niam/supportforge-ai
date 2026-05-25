from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List
from uuid import uuid4

from qdrant_client import QdrantClient, models
from sentence_transformers import SentenceTransformer

BASE_DIR = Path(__file__).resolve().parent
QDRANT_STORAGE_DIR = BASE_DIR / "qdrant_storage"
COLLECTION_NAME = "supportforge_documents"
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
VECTOR_SIZE = 384


@lru_cache(maxsize=1)
def get_embedding_model() -> SentenceTransformer:
    return SentenceTransformer(EMBEDDING_MODEL_NAME)


@lru_cache(maxsize=1)
def get_qdrant_client() -> QdrantClient:
    QDRANT_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    return QdrantClient(path=str(QDRANT_STORAGE_DIR))


def ensure_collection() -> QdrantClient:
    client = get_qdrant_client()
    try:
        client.get_collection(COLLECTION_NAME)
    except Exception:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=models.VectorParams(
                size=VECTOR_SIZE,
                distance=models.Distance.COSINE,
            ),
        )
    return client


def embed_texts(texts: List[str]) -> List[List[float]]:
    if not texts:
        return []
    model = get_embedding_model()
    vectors = model.encode(texts, normalize_embeddings=True)
    return vectors.tolist()


def add_document(document_id: str, filename: str, chunks: List[str]) -> int:
    if not chunks:
        return 0

    client = ensure_collection()
    vectors = embed_texts(chunks)

    points = []
    for index, (chunk, vector) in enumerate(zip(chunks, vectors)):
        points.append(
            models.PointStruct(
                id=str(uuid4()),
                vector=vector,
                payload={
                    "document_id": document_id,
                    "filename": filename,
                    "chunk_index": index,
                    "chunk": chunk,
                },
            )
        )

    client.upsert(
        collection_name=COLLECTION_NAME,
        points=points,
        wait=True,
    )

    return len(points)


def search_documents(query: str, top_k: int = 3) -> List[Dict[str, Any]]:
    query = query.strip()

    if not query:
        return []

    client = ensure_collection()

    query_vector = embed_texts([query])[0]

    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=top_k,
        with_payload=True,
    )

    hits = results.points

    final_results: List[Dict[str, Any]] = []

    for hit in hits:
        payload = hit.payload or {}

        final_results.append(
            {
                "document_id": payload.get("document_id", ""),
                "filename": payload.get("filename", ""),
                "chunk_index": payload.get("chunk_index", 0),
                "chunk": payload.get("chunk", ""),
                "score": float(hit.score),
            }
        )

    return final_results