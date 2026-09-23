import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db, AsyncSessionLocal
from app.models.project import Project, Document, User
from app.schemas.document import DocumentResponse
from app.core.auth import get_current_user
from app.services.storage import get_storage_provider
from app.services.parser import extract_text
from app.services.rag_service import index_document, delete_document_vectors
from app.core.cache import invalidate_project_cache

router = APIRouter()

async def process_and_index_document(project_id: uuid.UUID, doc_id: uuid.UUID, file_path: str, bucket: str):
    """Background task to extract text and index in the correct ChromaDB bucket."""
    try:
        text = extract_text(file_path)
        if not text.strip():
            raise ValueError("No text extracted from document")

        # Index in RAG bucket
        await index_document(str(project_id), str(doc_id), text, bucket)

        # Update database status
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Document).filter(Document.id == doc_id))
            doc = result.scalar_one_or_none()
            if doc:
                doc.status = "READY"
                await db.commit()
            print(f"Background parsing successfully completed for document: {doc_id} in {bucket}")
    except Exception as e:
        print(f"Background indexing failed for document {doc_id} in {bucket}: {e}")
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Document).filter(Document.id == doc_id))
            doc = result.scalar_one_or_none()
            if doc:
                doc.status = "FAILED"
                await db.commit()

@router.get("/projects/{project_id}/documents", response_model=List[DocumentResponse])
async def list_documents(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
        
    doc_result = await db.execute(
        select(Document).filter(Document.project_id == project_id).order_by(Document.created_at.desc())
    )
    return doc_result.scalars().all()

@router.post("/projects/{project_id}/upload", response_model=DocumentResponse)
async def upload_document(
    project_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    document_type: str = Form("AUTHOR_DOC"),
    bucket: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Map bucket if not specified
    if not bucket:
        if document_type == "AUTHOR_DOC":
            bucket = "author_material"
        elif document_type in ["COMPETITOR_DOC", "REFERENCE"]:
            bucket = "market_research"
        else:
            bucket = "author_material"

    if bucket not in ["author_material", "market_research"]:
        raise HTTPException(status_code=400, detail="Invalid bucket target")

    # Save file using StorageProvider
    file_id = uuid.uuid4()
    file_ext = os.path.splitext(file.filename)[1]
    safe_filename = f"{file_id}{file_ext}"
    
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File content is empty")

    try:
        storage = get_storage_provider()
        dest_path = await storage.save_file(safe_filename, content)
    except HTTPException:
        # Re-raise FastAPI/Starlette HTTP exceptions (e.g. 400 for empty file)
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {str(e)}")

    # Add to DB
    new_doc = Document(
        project_id=project_id,
        filename=file.filename,
        storage_path=dest_path,
        document_type=document_type,
        bucket=bucket,
        status="PROCESSING"
    )
    db.add(new_doc)
    await db.commit()
    await db.refresh(new_doc)

    # Queue background task to parse and index
    background_tasks.add_task(process_and_index_document, project_id, new_doc.id, dest_path, bucket)
    
    # Invalidate Cache
    invalidate_project_cache(project_id)

    return new_doc

@router.delete("/projects/{project_id}/documents/{document_id}")
async def delete_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    doc_result = await db.execute(
        select(Document).filter(Document.id == document_id, Document.project_id == project_id)
    )
    doc = doc_result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Remove file using StorageProvider
    try:
        storage = get_storage_provider()
        await storage.delete_file(doc.storage_path)
    except Exception as e:
        print(f"Error removing file from storage: {e}")
            
    # Remove vectors from correct bucket
    bucket = doc.bucket or "author_material"
    await delete_document_vectors(str(project_id), str(document_id), bucket)
            
    await db.delete(doc)
    await db.commit()
    
    # Invalidate Cache
    invalidate_project_cache(project_id)
    
    return {"message": "Document deleted successfully"}
