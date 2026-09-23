import os
import uuid
from typing import List, Dict, Any
import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer

from app.core.config import settings
from app.core.cache import cache_rag

# Lazy load model locally to save memory on server boot
embedding_model = None

def get_embedding_model():
    global embedding_model
    if embedding_model is None:
        try:
            print("Loading SentenceTransformer model 'all-MiniLM-L6-v2' locally...")
            os.environ["HF_HOME"] = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "temp", "hf_cache")
            embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            print("SentenceTransformer loaded successfully.")
        except Exception as e:
            print(f"Error loading SentenceTransformer: {e}")
    return embedding_model

chroma_client = None

def get_chroma_client():
    global chroma_client
    if chroma_client is None:
        try:
            print(f"Attempting to connect to ChromaDB HTTP Server at {settings.CHROMA_HOST}:{settings.CHROMA_PORT}...")
            client = chromadb.HttpClient(
                host=settings.CHROMA_HOST,
                port=settings.CHROMA_PORT,
                settings=ChromaSettings(anonymized_telemetry=False)
            )
            client.heartbeat()
            print("Connected to remote ChromaDB server successfully.")
            chroma_client = client
        except Exception as e:
            print(f"Could not connect to ChromaDB server ({e}). Falling back to local persistent storage...")
            local_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                "chroma_local"
            )
            os.makedirs(local_path, exist_ok=True)
            chroma_client = chromadb.PersistentClient(path=local_path)
            print(f"Local ChromaDB client initialized at: {local_path}")
    return chroma_client

def chunk_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
    """Split text into overlapping chunks."""
    if not text:
        return []
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - chunk_overlap
    return chunks

def get_or_create_collection(project_id: str, bucket: str = "author_material"):
    """Retrieve or create a ChromaDB collection for a project bucket."""
    if bucket not in ["author_material", "market_research"]:
        bucket = "author_material"
    collection_name = f"project_{project_id.replace('-', '_')}_{bucket}"
    
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"}
    )

async def index_document(project_id: str, document_id: str, text: str, bucket: str = "author_material"):
    """Chunk, embed, and index a document into ChromaDB."""
    model = get_embedding_model()
    if not model:
        raise ValueError("Embedding model not loaded")
        
    chunks = chunk_text(text)
    if not chunks:
        return
        
    collection = get_or_create_collection(project_id, bucket)
    
    # Generate embeddings locally
    embeddings = model.encode(chunks).tolist()
    
    ids = [f"{document_id}_{i}" for i in range(len(chunks))]
    metadatas = [{"document_id": document_id, "chunk_index": i} for i in range(len(chunks))]
    
    # Insert in batches of 100 to prevent overflow
    batch_size = 100
    for i in range(0, len(chunks), batch_size):
        end = min(i + batch_size, len(chunks))
        collection.add(
            ids=ids[i:end],
            embeddings=embeddings[i:end],
            documents=chunks[i:end],
            metadatas=metadatas[i:end]
        )
    print(f"Indexed document {document_id} in {bucket} with {len(chunks)} chunks.")

@cache_rag()
async def retrieve_context(project_id: str, query: str, bucket: str = "author_material", top_k: int = 5) -> List[str]:
    """Embed query and search ChromaDB for the most similar chunks."""
    model = get_embedding_model()
    if not model:
        return []
        
    try:
        collection = get_or_create_collection(project_id, bucket)
        query_embedding = model.encode(query).tolist()
        
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k
        )
        
        if results and 'documents' in results and results['documents']:
            return results['documents'][0]
    except Exception as e:
        print(f"Context retrieval failed for {bucket}: {e}")
        
    return []

async def delete_document_vectors(project_id: str, document_id: str, bucket: str = "author_material"):
    """Remove all vectors associated with a document from ChromaDB."""
    try:
        collection = get_or_create_collection(project_id, bucket)
        # Search and delete by metadata filter
        collection.delete(where={"document_id": document_id})
        print(f"Deleted vectors for document {document_id} from {bucket}")
    except Exception as e:
        print(f"Failed to delete document vectors from {bucket}: {e}")

