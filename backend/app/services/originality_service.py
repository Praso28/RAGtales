import re
from typing import List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Document
from app.services.rag_service import get_or_create_collection, get_embedding_model

async def check_originality(
    project_id: str,
    draft_content: str,
    db: AsyncSession
) -> Dict[str, Any]:
    """
    Check the originality of a draft against project documents using local ChromaDB vectors.
    """
    model = get_embedding_model()
    if not draft_content.strip() or not model:
        return {
            "overall_similarity": 0.0,
            "flagged_items": []
        }

    # Split draft into sentences (ignore very short sentences)
    raw_sentences = [s.strip() for s in re.split(r'[.!?]+', draft_content) if s.strip()]
    sentences = [s for s in raw_sentences if len(s.split()) >= 6] # Only check sentences with 6+ words

    if not sentences:
        return {
            "overall_similarity": 0.0,
            "flagged_items": []
        }

    flagged_items = []
    matched_sentence_count = 0
    
    try:
        collection = get_or_create_collection(project_id)
        
        import uuid
        project_uuid = uuid.UUID(project_id) if isinstance(project_id, str) else project_id
        
        # Resolve all document filenames in the project to show in source citations
        doc_result = await db.execute(select(Document).filter(Document.project_id == project_uuid))
        docs = doc_result.scalars().all()
        doc_map = {str(d.id): d.filename for d in docs}

        # Embed all query sentences in one batch for performance
        sentence_embeddings = model.encode(sentences).tolist()
        
        # Query ChromaDB for each sentence
        for i, sentence in enumerate(sentences):
            query_res = collection.query(
                query_embeddings=[sentence_embeddings[i]],
                n_results=1
            )
            
            if not query_res or not query_res['distances'] or not query_res['distances'][0]:
                continue
                
            distance = query_res['distances'][0][0]
            # Convert cosine distance to similarity percentage. 
            # Cosine distance in Chroma ranges from 0 (identical) to 2 (opposite).
            similarity = max(0.0, min(100.0, (1.0 - (distance / 2.0)) * 100))
            
            # If similarity is above 75%, flag it as a match
            if similarity > 75.0:
                matched_sentence_count += 1
                matched_doc_id = query_res['metadatas'][0][0].get('document_id', '')
                matched_text = query_res['documents'][0][0]
                
                source_name = doc_map.get(matched_doc_id, "Unknown Reference Material")
                
                flagged_items.append({
                    "draft_sentence": sentence,
                    "matched_text": matched_text,
                    "similarity_score": round(similarity, 1),
                    "source_document": source_name
                })
    except Exception as e:
        print(f"Originality checking failed: {e}")
        return {
            "overall_similarity": 0.0,
            "flagged_items": []
        }

    # Calculate overall similarity as percentage of flagged sentences
    overall_similarity = (matched_sentence_count / len(sentences)) * 100
    
    return {
        "overall_similarity": round(overall_similarity, 1),
        "flagged_items": flagged_items
    }
