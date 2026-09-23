import uuid
import logging
import json
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models.project import Project, Chapter, Draft, AIAuditLog, User, Document, Outline
from app.core.auth import get_current_user
from app.services.llm import get_llm_provider
from app.services.rag_service import retrieve_context
from app.services.humanizer_service import humanize_and_audit
from app.services.originality_service import check_originality
from app.services.style_analyzer import analyze_style
from app.services.parser import extract_text
from app.core.cache import invalidate_project_cache, cache_response

logger = logging.getLogger(__name__)
router = APIRouter()

class ChapterCreate(BaseModel):
    title: str
    content: Optional[str] = ""
    order: Optional[int] = 0

class ChapterUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    order: Optional[int] = None
    status: Optional[str] = None

class QuickGenerateRequest(BaseModel):
    chapter_id: uuid.UUID
    prompt: str
    tone: Optional[str] = "Informative"
    audience: Optional[str] = "General Public"

class GuidedStartRequest(BaseModel):
    chapter_id: uuid.UUID

class GuidedAnswerRequest(BaseModel):
    chapter_id: uuid.UUID
    answers: List[Dict[str, str]] # list of {"question": "...", "answer": "..."}

class GuidedFinishRequest(BaseModel):
    chapter_id: uuid.UUID
    answers: List[Dict[str, str]]
    tone: Optional[str] = "Informative"
    audience: Optional[str] = "General Public"

class GenerateStreamRequest(BaseModel):
    prompt: str
    tone: Optional[str] = "Informative"
    audience: Optional[str] = "General Public"

# Chapter CRUD Endpoints
@router.get("/projects/{project_id}/chapters")
@cache_response()
async def list_chapters(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
        
    result = await db.execute(
        select(Chapter).filter(Chapter.project_id == project_id).order_by(Chapter.order.asc(), Chapter.created_at.asc())
    )
    return result.scalars().all()

@router.post("/projects/{project_id}/chapters")
async def create_chapter(
    project_id: uuid.UUID,
    req: ChapterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    chapter = Chapter(
        project_id=project_id,
        title=req.title,
        content=req.content,
        order=req.order,
        status="draft"
    )
    db.add(chapter)
    await db.commit()
    await db.refresh(chapter)
    
    invalidate_project_cache(project_id)
    return chapter

@router.get("/projects/{project_id}/chapters/{chapter_id}")
async def get_chapter(
    project_id: uuid.UUID,
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Chapter).filter(Chapter.id == chapter_id, Chapter.project_id == project_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return chapter

@router.put("/projects/{project_id}/chapters/{chapter_id}")
async def update_chapter(
    project_id: uuid.UUID,
    chapter_id: uuid.UUID,
    req: ChapterUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Chapter).filter(Chapter.id == chapter_id, Chapter.project_id == project_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
        
    update_data = req.dict(exclude_unset=True)
    for k, v in update_data.items():
        setattr(chapter, k, v)
        
    await db.commit()
    await db.refresh(chapter)
    
    invalidate_project_cache(project_id)
    return chapter

@router.delete("/projects/{project_id}/chapters/{chapter_id}")
async def delete_chapter(
    project_id: uuid.UUID,
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Chapter).filter(Chapter.id == chapter_id, Chapter.project_id == project_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
        
    await db.delete(chapter)
    await db.commit()
    
    invalidate_project_cache(project_id)
    return {"message": "Chapter deleted successfully"}


# Helper to analyze style profile
async def _get_style_profile(project_id: uuid.UUID, db: AsyncSession) -> str:
    doc_result = await db.execute(
        select(Document).filter(
            Document.project_id == project_id, 
            Document.document_type == "AUTHOR_DOC",
            Document.status == "READY"
        )
    )
    author_docs = doc_result.scalars().all()
    style_description = ""
    if author_docs:
        combined_text = []
        for d in author_docs[:3]:
            try:
                t = extract_text(d.storage_path)
                if t: combined_text.append(t)
            except Exception:
                pass
        if combined_text:
            profile = analyze_style("\n\n".join(combined_text))
            style_description = profile.get("style_description", "")
    return style_description


# Helper to clean LLM markdown code blocks and concluding note artifacts
def clean_llm_markdown_artifacts(text: str) -> str:
    import re
    if not text:
        return ""
    # Remove markdown code block boundaries (e.g., ```markdown or ``` at start/end of the string)
    text = re.sub(r"^```[a-zA-Z]*\n", "", text)
    text = re.sub(r"\n```$", "", text)
    text = re.sub(r"^```$", "", text)
    text = text.strip()
    
    # Remove typical concluding/conversational meta-commentary lines
    lines = text.split("\n")
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        # Skip notes, conclusions, and end of chapter markers
        if re.search(r"^\*\*End of Chapter.*?\*\*$", stripped, re.IGNORECASE):
            continue
        if re.search(r"^\*?Note:.*?\*?$", stripped, re.IGNORECASE):
            continue
        if re.search(r"^That concludes Chapter", stripped, re.IGNORECASE):
            continue
        if re.search(r"^Keep in mind, the plot twist", stripped, re.IGNORECASE):
            continue
        cleaned_lines.append(line)
        
    return "\n".join(cleaned_lines).strip()


# Helper to build generation system/user prompts and dynamic parameters
async def _build_generation_prompts(
    project: Project,
    chapter: Chapter,
    req_prompt: str,
    req_tone: str,
    req_audience: str,
    db: AsyncSession,
    answers_transcript: Optional[str] = None
) -> tuple[str, str, float]:
    """
    Builds the system prompt, user prompt, and temperature based on the Project's
    Creative Foundation (factual_weight, POV, characters, setting), outline, preceding chapter, and existing draft.
    """
    # 1. Fetch Outline Context
    outline_result = await db.execute(select(Outline).filter(Outline.project_id == project.id))
    outline = outline_result.scalar_one_or_none()
    outline_info = ""
    if outline and outline.structure:
        outline_info = "Overall Book Outline Structure:\n"
        for idx, chap_struct in enumerate(outline.structure):
            outline_info += f"- Chapter {idx + 1}: {chap_struct.get('title', '')} - {chap_struct.get('description', '')}\n"
            
    # 2. Fetch Preceding Chapter Context (only completed, non-empty ones)
    prev_result = await db.execute(
        select(Chapter)
        .filter(Chapter.project_id == project.id, Chapter.order < chapter.order)
        .order_by(Chapter.order.desc())
    )
    prev_chapters = prev_result.scalars().all()
    
    prev_chapter = None
    for pc in prev_chapters:
        if pc.content and pc.content.strip():
            prev_chapter = pc
            break
            
    prev_context_str = ""
    if prev_chapter:
        content_words = prev_chapter.content.split()
        last_words = content_words[-1200:] # Last 1200 words for narrative bridge
        prev_context_str = f"Context of Preceding Chapter ({prev_chapter.title}):\n"
        prev_context_str += "... " + " ".join(last_words) + "\n\n"
        
    # 3. Read Creative Foundation
    ctx = project.book_context or {}
    genre = ctx.get("genre", "Fiction")
    factual_weight = ctx.get("factual_weight", 0.5)
    pov = ctx.get("pov", "Third-person limited")
    characters = ctx.get("characters", [])
    settings_info = ctx.get("settings", "")
    custom_rules = ctx.get("custom_rules", "")
    high_level_storyline = ctx.get("high_level_storyline", "")
    
    character_str = ""
    if characters:
        character_str = "Key Characters/Figures in the Book:\n"
        for char in characters:
            character_str += f"- {char.get('name', 'Unnamed')} ({char.get('role', 'Supporting')}): {char.get('description', '')}\n"
            
    # 4. Determine Dynamic Temperature & Factual Guardrails based on Factual-Creative Spectrum
    temperature = 0.7
    guardrails = ""
    if factual_weight >= 0.7:
        temperature = 0.2
        guardrails = (
            "CRITICAL: This is a highly factual, evidence-based book. "
            "Do NOT invent fictional characters, introduce dialogue, or speculate. "
            "Stick strictly to verifiable claims, referencing the provided source materials. "
            "Write in an analytical, clear, and informative voice."
        )
    elif factual_weight <= 0.3:
        temperature = 0.85
        guardrails = (
            "CRITICAL: This is a creative narrative work. Focus heavily on storytelling pacing, sensory details, "
            "character voice, and dialogue. Ensure stylistic variety and rich narrative prose."
        )
    else:
        temperature = 0.6
        guardrails = (
            "CRITICAL: This is a narrative non-fiction/balanced work. Combine engaging story-driven prose "
            "with factual accuracy. Do not fabricate core historical/scientific facts, but present them narrative-style."
        )
        
    # 5. Build System Prompt
    system_prompt = (
        "You are a supportive, collaborative co-author drafting a chapter. "
        "Your task is to draft/refine the chapter content matching the creative foundation details below.\n\n"
        f"Book Title: {project.name}\n"
        f"Genre: {genre}\n"
        f"Point of View (POV): {pov}\n"
        f"Writing Tone: {req_tone}\n"
        f"Target Audience: {req_audience}\n\n"
    )
    
    if high_level_storyline:
        system_prompt += f"High-Level Storyline / Plot Arc:\n{high_level_storyline}\n\n"
    if settings_info:
        system_prompt += f"Settings / World-Building:\n{settings_info}\n\n"
    if character_str:
        system_prompt += f"{character_str}\n"
    if outline_info:
        system_prompt += f"{outline_info}\n"
    if guardrails:
        system_prompt += f"{guardrails}\n\n"
    if custom_rules:
        system_prompt += f"Writer's Custom Guidelines:\n{custom_rules}\n\n"
        
    system_prompt += (
        "General Instructions:\n"
        "- Ensure smooth transitions and logical flow.\n"
        "- Maintain consistent character names and POV throughout.\n"
        "- Do NOT write introductory remarks (like 'Here is Chapter 1') or concluding notes (like 'End of Chapter...'). "
        "Output ONLY the final book text itself."
    )
    
    # 6. Retrieve RAG context chunks
    context_chunks = await retrieve_context(str(project.id), req_prompt, bucket="author_material", top_k=5)
    context_str = "\n\n---\n\n".join(context_chunks) if context_chunks else "No author materials context available."
    
    # 7. Style profile (mimic voice)
    style_profile = await _get_style_profile(project.id, db)
    style_guideline = f"\nAuthor's Stylistic Profile Guidelines (Mimic this voice):\n{style_profile}\n" if style_profile else ""
    
    # 8. Check for Complementary Editing Mode (Existing draft content)
    existing_draft_str = ""
    is_rewrite = any(w in req_prompt.lower() for w in ["rewrite", "restart", "start over", "clear and rewrite", "overwrite"])
    if chapter.content and chapter.content.strip() and not is_rewrite:
        existing_draft_str = (
            f"Existing Draft of this Chapter:\n[START OF EXISTING DRAFT]\n{chapter.content}\n[END OF EXISTING DRAFT]\n\n"
            "CRITICAL: A draft already exists. Do NOT discard or fully rewrite this draft. Instead, "
            "build upon, refine, extend, or edit the existing draft to incorporate the new instructions or Q&A answers, "
            "preserving as much of the existing draft as makes sense."
        )
    
    transcript_str = f"User Q&A Transcript:\n{answers_transcript}\n\n" if answers_transcript else ""
    
    # 9. Build User Prompt
    user_prompt = (
        f"{prev_context_str}"
        f"Source Materials/Context:\n{context_str}\n\n"
        f"{style_guideline}\n"
        f"{existing_draft_str}"
        f"{transcript_str}"
        f"Chapter Directive / Prompt:\n{req_prompt}\n\n"
        f"Drafting Chapter '{chapter.title}' (Chapter {chapter.order}) now:"
    )
    
    return system_prompt, user_prompt, temperature


# Quick Generation Mode
@router.post("/projects/{project_id}/chapters/generate/quick")
async def generate_chapter_quick(
    project_id: uuid.UUID,
    req: QuickGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Load project and chapter
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    chapter_result = await db.execute(
        select(Chapter).filter(Chapter.id == req.chapter_id, Chapter.project_id == project_id)
    )
    chapter = chapter_result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    # Update chapter status to generating
    chapter.status = "generating"
    db.add(chapter)
    await db.commit()

    # Build prompts and get spectrum-derived temperature
    system_prompt, user_prompt, temp = await _build_generation_prompts(
        project=project,
        chapter=chapter,
        req_prompt=req.prompt,
        req_tone=req.tone,
        req_audience=req.audience,
        db=db
    )

    try:
        provider = get_llm_provider()
        raw_draft = await provider.generate(
            system_prompt=system_prompt,
            prompt=user_prompt,
            temperature=temp,
            max_tokens=4000
        )
        
        # Clean formatting artifacts (markdown code blocks, notes) before humanizing
        cleaned_draft = clean_llm_markdown_artifacts(raw_draft)
        
        # 5. Call two-stage humanizer and originality check
        humanized_draft, originality_report = await humanize_and_audit(str(project_id), cleaned_draft, db)
        # Run another cleanup after humanization to be sure
        final_draft = clean_llm_markdown_artifacts(humanized_draft)
        
    except Exception as e:
        chapter.status = "draft"
        db.add(chapter)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

    # 6. Save chapter draft
    chapter.content = final_draft
    chapter.status = "completed"
    chapter.originality_score = originality_report
    db.add(chapter)

    # 7. Save Draft History
    draft = Draft(
        project_id=project_id,
        title=f"Quick: {chapter.title}",
        content=final_draft
    )
    db.add(draft)

    # 8. Log to AIAuditLog
    audit_log = AIAuditLog(
        project_id=project_id,
        user_id=current_user.id,
        action="generate_chapter_quick",
        prompt=user_prompt,
        response=final_draft,
        provider=getattr(provider, "__class__", "default").__name__,
        model=getattr(provider, "model", "default")
    )
    db.add(audit_log)
    
    await db.commit()
    invalidate_project_cache(project_id)
    
    return {
        "chapter": chapter,
        "originality_report": originality_report
    }


@router.post("/projects/{project_id}/chapters/{chapter_id}/generate-stream")
async def generate_chapter_stream(
    project_id: uuid.UUID,
    chapter_id: uuid.UUID,
    req: GenerateStreamRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    chapter_result = await db.execute(
        select(Chapter).filter(Chapter.id == chapter_id, Chapter.project_id == project_id)
    )
    chapter = chapter_result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    chapter.status = "generating"
    db.add(chapter)
    await db.commit()

    # Build prompts and get spectrum-derived temperature
    system_prompt, user_prompt, temp = await _build_generation_prompts(
        project=project,
        chapter=chapter,
        req_prompt=req.prompt,
        req_tone=req.tone,
        req_audience=req.audience,
        db=db
    )

    async def event_generator():
        try:
            provider = get_llm_provider()
            generated_text = ""
            
            if hasattr(provider, "generate_stream"):
                async for token in provider.generate_stream(
                    system_prompt=system_prompt,
                    prompt=user_prompt,
                    temperature=temp,
                    max_tokens=4000
                ):
                    generated_text += token
                    yield f"data: {json.dumps({'token': token})}\n\n"
            else:
                raw_draft = await provider.generate(
                    system_prompt=system_prompt,
                    prompt=user_prompt,
                    temperature=temp,
                    max_tokens=4000
                )
                generated_text = raw_draft
                yield f"data: {json.dumps({'token': raw_draft})}\n\n"

            # Post-process, clean and humanize final draft
            cleaned_draft = clean_llm_markdown_artifacts(generated_text)
            from app.services.humanizer_service import humanize_content
            humanized_draft = await humanize_content(cleaned_draft)
            final_draft = clean_llm_markdown_artifacts(humanized_draft)

            originality_report = await check_originality(str(project_id), final_draft, db)

            chapter.content = final_draft
            chapter.status = "completed"
            chapter.originality_score = originality_report
            db.add(chapter)

            draft = Draft(
                project_id=project_id,
                title=f"Stream: {chapter.title}",
                content=final_draft
            )
            db.add(draft)

            audit_log = AIAuditLog(
                project_id=project_id,
                user_id=current_user.id,
                action="generate_chapter_stream",
                prompt=user_prompt,
                response=final_draft,
                provider=getattr(provider, "__class__", "default").__name__,
                model=getattr(provider, "model", "default")
            )
            db.add(audit_log)
            
            await db.commit()
            invalidate_project_cache(project_id)

            yield f"data: {json.dumps({'done': True, 'originality': originality_report})}\n\n"
            
        except Exception as e:
            logger.error(f"Streaming generation failed: {e}")
            chapter.status = "draft"
            db.add(chapter)
            await db.commit()
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# Guided Generation Mode (Q&A Loop)
@router.post("/projects/{project_id}/chapters/generate/guided/start")
async def generate_guided_start(
    project_id: uuid.UUID,
    req: GuidedStartRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(Chapter).filter(Chapter.id == req.chapter_id, Chapter.project_id == project_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
        
    # Check factual weight from creative foundation
    context = project.book_context or {}
    factual_weight = context.get("factual_weight", 0.5)
    
    if factual_weight < 0.4:
        first_question = "What major plot event or character action takes place in this chapter?"
    else:
        first_question = "What is the primary message or core lesson you want to convey in this chapter?"
        
    return {
        "step": 1,
        "question": first_question,
        "answers": []
    }

@router.post("/projects/{project_id}/chapters/generate/guided/answer")
async def generate_guided_answer(
    project_id: uuid.UUID,
    req: GuidedAnswerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(Chapter).filter(Chapter.id == req.chapter_id, Chapter.project_id == project_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
        
    num_answers = len(req.answers)
    
    context = project.book_context or {}
    factual_weight = context.get("factual_weight", 0.5)
    
    if factual_weight < 0.4:
        # Creative questions
        if num_answers == 1:
            next_question = "Which characters are focused on, and what is their primary conflict or interaction?"
        elif num_answers == 2:
            next_question = "What specific setting, atmosphere, or key dialogue should be included?"
        else:
            next_question = None
    else:
        # Factual questions
        if num_answers == 1:
            next_question = "What real-world examples, case studies, or personal stories should support this chapter?"
        elif num_answers == 2:
            next_question = "Are there any specific arguments, facts, or technical terms that must be explicitly included?"
        else:
            next_question = None

    return {
        "step": num_answers + 1,
        "question": next_question,
        "answers": req.answers,
        "done": next_question is None
    }

@router.post("/projects/{project_id}/chapters/generate/guided/finish")
async def generate_guided_finish(
    project_id: uuid.UUID,
    req: GuidedFinishRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    chapter_result = await db.execute(
        select(Chapter).filter(Chapter.id == req.chapter_id, Chapter.project_id == project_id)
    )
    chapter = chapter_result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    # Update status to generating
    chapter.status = "generating"
    db.add(chapter)
    await db.commit()

    # Compile the Q&A transcripts
    if req.answers:
        transcript = "\n".join([f"Q: {ans.get('question', '')}\nA: {ans.get('answer', '')}" for ans in req.answers])
        query = " ".join([ans.get('answer', '') for ans in req.answers])
    else:
        transcript = "No user answers provided."
        query = chapter.title

    # Build prompts and get spectrum-derived temperature
    system_prompt, user_prompt, temp = await _build_generation_prompts(
        project=project,
        chapter=chapter,
        req_prompt=query,
        req_tone=req.tone,
        req_audience=req.audience,
        db=db,
        answers_transcript=transcript
    )

    try:
        provider = get_llm_provider()
        raw_draft = await provider.generate(
            system_prompt=system_prompt,
            prompt=user_prompt,
            temperature=temp,
            max_tokens=4000
        )
        
        # Clean formatting artifacts (markdown code blocks, notes) before humanizing
        cleaned_draft = clean_llm_markdown_artifacts(raw_draft)
        
        # Humanize and originality check
        humanized_draft, originality_report = await humanize_and_audit(str(project_id), cleaned_draft, db)
        final_draft = clean_llm_markdown_artifacts(humanized_draft)
        
    except Exception as e:
        chapter.status = "draft"
        db.add(chapter)
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Guided generation failed: {str(e)}")

    # Update chapter content
    chapter.content = final_draft
    chapter.status = "completed"
    chapter.originality_score = originality_report
    db.add(chapter)

    # Save Draft History
    draft = Draft(
        project_id=project_id,
        title=f"Guided: {chapter.title}",
        content=final_draft
    )
    db.add(draft)

    # Log AIAuditLog
    audit_log = AIAuditLog(
        project_id=project_id,
        user_id=current_user.id,
        action="generate_chapter_guided",
        prompt=user_prompt,
        response=final_draft,
        provider=getattr(provider, "__class__", "default").__name__,
        model=getattr(provider, "model", "default")
    )
    db.add(audit_log)
    
    await db.commit()
    invalidate_project_cache(project_id)

    return {
        "chapter": chapter,
        "originality_report": originality_report
    }


@router.post("/projects/{project_id}/chapters/{chapter_id}/check-originality")
async def check_chapter_originality(
    project_id: uuid.UUID,
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    result = await db.execute(
        select(Chapter).filter(Chapter.id == chapter_id, Chapter.project_id == project_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
        
    report = await check_originality(str(project_id), chapter.content, db)
    chapter.originality_score = report
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(chapter, "originality_score")
    db.add(chapter)
    await db.commit()
    invalidate_project_cache(project_id)
    return report


@router.post("/projects/{project_id}/chapters/{chapter_id}/refine")
async def refine_chapter(
    project_id: uuid.UUID,
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    result = await db.execute(
        select(Chapter).filter(Chapter.id == chapter_id, Chapter.project_id == project_id)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
        
    humanized_text, originality_report = await humanize_and_audit(str(project_id), chapter.content, db)
    chapter.content = humanized_text
    chapter.originality_score = originality_report
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(chapter, "originality_score")
    db.add(chapter)
    await db.commit()
    invalidate_project_cache(project_id)
    return {
        "chapter": chapter,
        "originality_report": originality_report
    }

@router.post("/projects/{project_id}/chapters/{chapter_id}/reject")
async def reject_chapter_draft(
    project_id: uuid.UUID,
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify project
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    # Load chapter
    chap_result = await db.execute(
        select(Chapter).filter(Chapter.id == chapter_id, Chapter.project_id == project_id)
    )
    chapter = chap_result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    chapter.content = ""
    chapter.status = "draft"
    chapter.originality_score = None
    db.add(chapter)
    
    # Also delete associated Draft models of this chapter to maintain database hygiene
    from sqlalchemy import delete
    await db.execute(
        delete(Draft).filter(Draft.project_id == project_id, Draft.title.like(f"%: {chapter.title}"))
    )
    
    await db.commit()
    invalidate_project_cache(project_id)
    
    return {"message": "Draft successfully rejected and cleared."}
