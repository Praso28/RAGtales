import uuid
import json
import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models.project import Project, Outline, AIAuditLog, User
from app.core.auth import get_current_user
from app.services.llm import get_llm_provider
from app.services.rag_service import retrieve_context
from app.core.cache import invalidate_project_cache, cache_response
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

class OutlineSaveRequest(BaseModel):
    structure: List[Dict[str, Any]]
    status: Optional[str] = "draft"

@router.get("/projects/{project_id}/outline")
@cache_response()
async def get_outline(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify project
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(select(Outline).filter(Outline.project_id == project_id))
    outline = result.scalar_one_or_none()
    if not outline:
        raise HTTPException(status_code=404, detail="Outline not generated yet")
        
    return {
        "id": str(outline.id),
        "project_id": str(outline.project_id),
        "structure": outline.structure,
        "status": outline.status,
        "created_at": outline.created_at.isoformat()
    }

@router.post("/projects/{project_id}/outline/generate")
async def generate_outline(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Load project and context
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    context = project.book_context or {}
    
    # 2. Retrieve market research context matching book description/title
    query = f"Table of contents competitors structure for: {project.name} - {context.get('description', '')}"
    market_context = await retrieve_context(str(project_id), query, bucket="market_research", top_k=5)
    context_str = "\n\n---\n\n".join(market_context) if market_context else "No market research source materials available."
    
    # 3. Create LLM prompts
    system_prompt = (
        "You are a collaborative, supportive co-author helping the writer build a clear book blueprint. "
        "Your task is to design a structured book outline and propose the creative foundation (blueprint) for the book "
        "based on the writer's initial context and competitor references.\n\n"
        "Instructions:\n"
        "Generate a single, valid JSON object containing the following keys:\n"
        "1. \"structure\": A list of chapters. For each chapter, include:\n"
        "   - \"title\": \"Chapter [X]: [Title]\"\n"
        "   - \"description\": \"[Warm, high-level summary of what this chapter covers]\"\n"
        "   - \"sections\": [\"Section Name\", ...]\n"
        "   - \"gaps\": [\"Badge/focus area this chapter addresses\"]\n"
        "2. \"suggested_blueprint\": An object proposing the creative settings for this book:\n"
        "   - \"genre\": \"[e.g., Fiction, Non-fiction, Self-help, Science Fiction, Biography]\"\n"
        "   - \"factual_weight\": [A number from 0.0 to 1.0. Use 0.0 for pure creative stories, 1.0 for strictly evidence-based factual reference work, and 0.5 for balanced narrative non-fiction]\n"
        "   - \"pov\": \"[Suggested point of view, e.g., 'First-person (I)', 'Third-person limited (Elena)', or 'N/A' for non-fiction]\"\n"
        "   - \"characters\": A list of objects with keys \"name\", \"description\", and \"role\" (e.g. 'Protagonist', 'Mentor', 'Expert') representing key figures or characters\n"
        "   - \"settings\": \"[Suggested world-building settings or spatial/temporal context]\"\n"
        "   - \"custom_rules\": \"[Warmly phrased formatting guidelines, e.g., 'No narrative meta-commentary at chapter ends']\"\n\n"
        "Return ONLY valid, parseable JSON code. Do not include markdown fencing (like ```json), notes, or chat commentary outside the JSON."
    )
    
    user_prompt = (
        f"Book Details:\n"
        f"- Title: {context.get('title', project.name)}\n"
        f"- Subtitle: {context.get('subtitle', '')}\n"
        f"- Target Audience: {context.get('audience', '')}\n"
        f"- Book Objective: {context.get('objective', '')}\n"
        f"- Tone: {context.get('tone', 'Informative')}\n\n"
        f"Competitor/Reference Context:\n{context_str}\n\n"
        f"Design the book outline and creative blueprint now:"
    )

    try:
        provider = get_llm_provider()
        model_name = getattr(provider, "model", "default")
        
        response_text = await provider.generate(
            system_prompt=system_prompt,
            prompt=user_prompt,
            temperature=0.7,
            max_tokens=4000
        )
        
        # Clean potential markdown output
        cleaned_response = response_text.strip()
        if cleaned_response.startswith("```json"):
            cleaned_response = cleaned_response[7:]
        if cleaned_response.endswith("```"):
            cleaned_response = cleaned_response[:-3]
        cleaned_response = cleaned_response.strip()
        
        # Verify parseable JSON
        output_data = json.loads(cleaned_response)
        if not isinstance(output_data, dict):
            raise ValueError("Outline output must be a JSON object")
            
        structure = output_data.get("structure", [])
        suggested_blueprint = output_data.get("suggested_blueprint", {})
        if not isinstance(structure, list):
            raise ValueError("Outline structure must be a list of chapters")
            
    except Exception as e:
        logger.error(f"Outline generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate outline: {str(e)}")

    # Update project book_context with suggested blueprint fields
    from sqlalchemy.orm.attributes import flag_modified
    current_context = dict(project.book_context or {})
    
    if suggested_blueprint:
        for k, v in suggested_blueprint.items():
            if not current_context.get(k) or current_context[k] == "" or current_context[k] == []:
                current_context[k] = v
                
    project.book_context = current_context
    flag_modified(project, "book_context")
    db.add(project)

    # 4. Save/Update Outline in DB
    existing_result = await db.execute(select(Outline).filter(Outline.project_id == project_id))
    outline = existing_result.scalar_one_or_none()
    
    if outline:
        outline.structure = structure
        outline.status = "draft"
    else:
        outline = Outline(
            project_id=project_id,
            structure=structure,
            status="draft"
        )
        db.add(outline)
        
    # 5. Log to AIAuditLog
    audit_log = AIAuditLog(
        project_id=project_id,
        user_id=current_user.id,
        action="generate_outline",
        prompt=user_prompt,
        response=cleaned_response,
        provider=settings.LLM_PROVIDER,
        model=model_name
    )
    db.add(audit_log)
    
    await db.commit()
    await db.refresh(outline)
    await db.refresh(project)
    
    # Invalidate Cache
    invalidate_project_cache(project_id)
    
    return {
        "id": str(outline.id),
        "project_id": str(outline.project_id),
        "structure": outline.structure,
        "status": outline.status,
        "book_context": project.book_context,
        "created_at": outline.created_at.isoformat()
    }

@router.put("/projects/{project_id}/outline")
async def update_outline(
    project_id: uuid.UUID,
    req: OutlineSaveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify project
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(select(Outline).filter(Outline.project_id == project_id))
    outline = result.scalar_one_or_none()
    
    if not outline:
        outline = Outline(
            project_id=project_id,
            structure=req.structure,
            status=req.status
        )
        db.add(outline)
    else:
        outline.structure = req.structure
        outline.status = req.status
        
    await db.commit()
    await db.refresh(outline)
    
    # Invalidate Cache
    invalidate_project_cache(project_id)
    
    return {
        "id": str(outline.id),
        "project_id": str(outline.project_id),
        "structure": outline.structure,
        "status": outline.status
    }

@router.post("/projects/{project_id}/outline/reject")
async def reject_outline(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify project
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Load outline
    result = await db.execute(select(Outline).filter(Outline.project_id == project_id))
    outline = result.scalar_one_or_none()
    if outline:
        await db.delete(outline)
        await db.commit()
        invalidate_project_cache(project_id)
        
    return {"message": "Outline draft successfully rejected and deleted."}
