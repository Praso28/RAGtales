import uuid
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models.project import Project, Document, Draft, User, Chapter, ChatSession
from app.schemas.project import ProjectCreate, ProjectResponse
from app.schemas.draft import DraftCreate, DraftResponse, DraftUpdate
from app.core.auth import get_current_user
from app.core.cache import cache_response, invalidate_project_cache
from app.services.style_analyzer import analyze_style
from app.services.parser import extract_text
from app.services.originality_service import check_originality

router = APIRouter()

class BookContextUpdate(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    audience: Optional[str] = None
    objective: Optional[str] = None
    reader_before: Optional[str] = None
    reader_after: Optional[str] = None
    tone: Optional[str] = None
    genre: Optional[str] = None
    factual_weight: Optional[float] = None
    pov: Optional[str] = None
    characters: Optional[List[Dict[str, Any]]] = None
    settings: Optional[str] = None
    high_level_storyline: Optional[str] = None
    custom_rules: Optional[str] = None

@router.post("/projects", response_model=ProjectResponse)
async def create_project(
    project_in: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_project = Project(
        name=project_in.name,
        description=project_in.description,
        user_id=current_user.id,
        book_context={
            "title": project_in.name,
            "subtitle": "",
            "audience": "",
            "objective": "",
            "reader_before": "",
            "reader_after": "",
            "tone": "Informative",
            "genre": "Fiction",
            "factual_weight": 0.5,
            "pov": "Third-person limited",
            "characters": [],
            "settings": "",
            "high_level_storyline": "",
            "custom_rules": ""
        }
    )
    db.add(new_project)
    await db.commit()
    await db.refresh(new_project)
    return new_project

@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    await db.delete(project)
    await db.commit()
    invalidate_project_cache(project_id)
    return {"message": "Project deleted successfully"}

@router.get("/projects", response_model=List[ProjectResponse])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Project)
        .filter((Project.user_id == current_user.id) | (Project.user_id == None))
        .order_by(Project.created_at.desc())
    )
    return result.scalars().all()

@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.get("/projects/{project_id}/context")
async def get_book_context(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    return project.book_context or {}

@router.post("/projects/{project_id}/context")
@router.patch("/projects/{project_id}/context")
async def update_book_context(
    project_id: uuid.UUID,
    context_in: BookContextUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    from sqlalchemy.orm.attributes import flag_modified
    current_context = dict(project.book_context or {})
    
    # Merge context update
    update_data = context_in.dict(exclude_unset=True)
    for k, v in update_data.items():
        current_context[k] = v
        
    project.book_context = current_context
    flag_modified(project, "book_context")
    db.add(project)
    await db.commit()
    print(f"DATABASE UPDATE SUCCESS: book_context updated to: {project.book_context}")
    
    # Invalidate cache
    invalidate_project_cache(project_id)
    
    return project.book_context

@router.get("/projects/{project_id}/context/flags")
async def get_book_context_flags(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Run heuristic warnings/flags check on book context fields.
    Returns warnings list for UI flags.
    """
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    context = project.book_context or {}
    print(f"DATABASE GET FLAGS: book_context fetched is: {context}")
    flags = {}
    
    # Field Checks
    title = context.get("title", "")
    if not title or len(title.strip()) < 3 or title.lower() in ["tbd", "untitled", "book title"]:
        flags["title"] = {
            "warning": "Title is placeholder or too generic.",
            "flag": True
        }
        
    subtitle = context.get("subtitle", "")
    if not subtitle or len(subtitle.strip()) < 5:
        flags["subtitle"] = {
            "warning": "Provide a descriptive subtitle to guide writing.",
            "flag": True
        }
        
    audience = context.get("audience", "")
    if not audience or len(audience.split()) < 4:
        flags["audience"] = {
            "warning": "Describe target audience in more detail (e.g. demographics, background).",
            "flag": True
        }
        
    objective = context.get("objective", "")
    if not objective or len(objective.split()) < 8:
        flags["objective"] = {
            "warning": "Explain primary book goal/objective in detail.",
            "flag": True
        }
        
    r_before = context.get("reader_before", "")
    if not r_before or len(r_before.split()) < 6:
        flags["reader_before"] = {
            "warning": "Explain reader's initial mindset in more detail.",
            "flag": True
        }
        
    r_after = context.get("reader_after", "")
    if not r_after or len(r_after.split()) < 6:
        flags["reader_after"] = {
            "warning": "Explain reader's post-reading mindset in more detail.",
            "flag": True
        }

    return flags

@router.get("/projects/{project_id}/style-profile")
async def get_project_style_profile(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    doc_result = await db.execute(
        select(Document).filter(
            Document.project_id == project_id, 
            Document.document_type == "AUTHOR_DOC",
            Document.status == "READY"
        )
    )
    author_docs = doc_result.scalars().all()
    
    if not author_docs:
        return {
            "avg_sentence_length": 0.0,
            "vocabulary_diversity": 0.0,
            "readability_score": 0.0,
            "style_description": "No author sample documents ('AUTHOR_DOC') uploaded yet. Upload sample writings to model the stylistic profile."
        }

    combined_text = []
    for doc in author_docs:
        try:
            text = extract_text(doc.storage_path)
            if text:
                combined_text.append(text)
        except Exception as e:
            print(f"Error reading doc {doc.id} for style: {e}")

    aggregated_text = "\n\n".join(combined_text)
    return analyze_style(aggregated_text)

# Drafts endpoints
@router.get("/projects/{project_id}/drafts", response_model=List[DraftResponse])
@cache_response()
async def list_drafts(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")
    result = await db.execute(
        select(Draft).filter(Draft.project_id == project_id).order_by(Draft.created_at.desc())
    )
    return result.scalars().all()

@router.post("/projects/{project_id}/drafts", response_model=DraftResponse)
async def create_manual_draft(
    project_id: uuid.UUID,
    draft_in: DraftCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")
    new_draft = Draft(
        project_id=project_id,
        title=draft_in.title,
        content=draft_in.content
    )
    db.add(new_draft)
    await db.commit()
    await db.refresh(new_draft)
    
    invalidate_project_cache(project_id)
    return new_draft

@router.put("/projects/{project_id}/drafts/{draft_id}", response_model=DraftResponse)
async def update_draft(
    project_id: uuid.UUID,
    draft_id: uuid.UUID,
    draft_in: DraftUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")
    result = await db.execute(
        select(Draft).filter(Draft.id == draft_id, Draft.project_id == project_id)
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
        
    draft.title = draft_in.title
    draft.content = draft_in.content
    await db.commit()
    await db.refresh(draft)
    
    invalidate_project_cache(project_id)
    return draft

@router.delete("/projects/{project_id}/drafts/{draft_id}")
async def delete_draft(
    project_id: uuid.UUID,
    draft_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")
    result = await db.execute(
        select(Draft).filter(Draft.id == draft_id, Draft.project_id == project_id)
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
        
    await db.delete(draft)
    await db.commit()
    
    invalidate_project_cache(project_id)
    return {"message": "Draft deleted successfully"}

@router.post("/projects/{project_id}/drafts/{draft_id}/check-originality")
async def check_draft_originality(
    project_id: uuid.UUID,
    draft_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    result = await db.execute(
        select(Draft).filter(Draft.id == draft_id, Draft.project_id == project_id)
    )
    draft = result.scalar_one_or_none()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
        
    return await check_originality(str(project_id), draft.content, db)


@router.get("/projects/{project_id}/stats")
async def get_project_stats(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    chap_result = await db.execute(
        select(Chapter).filter(Chapter.project_id == project_id)
    )
    chapters = chap_result.scalars().all()
    chapter_count = len(chapters)

    total_words = 0
    originality_sum = 0.0
    evaluated_chapters = 0

    for ch in chapters:
        if ch.content and ch.content.strip():
            words_count = len(ch.content.split())
            total_words += words_count
            
            res = ch.originality_score
            if not res:
                try:
                    res = await check_originality(str(project_id), ch.content, db)
                    ch.originality_score = res
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(ch, "originality_score")
                    db.add(ch)
                    await db.commit()
                except Exception:
                    res = None
            
            if res:
                sim = res.get("overall_similarity", 0.0)
                originality_sum += (100.0 - sim)
                evaluated_chapters += 1

    avg_originality = (originality_sum / evaluated_chapters) if evaluated_chapters > 0 else 100.0

    session_result = await db.execute(
        select(ChatSession).filter(ChatSession.project_id == project_id)
    )
    sessions_count = len(session_result.scalars().all())

    return {
        "chapter_count": chapter_count,
        "total_words": total_words,
        "avg_originality": round(avg_originality, 1),
        "sessions_count": sessions_count
    }
