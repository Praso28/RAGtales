import uuid
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models.project import Project, ChatSession, ChatMessage, User
from app.core.auth import get_current_user
from app.services.chat_service import generate_chat_response

router = APIRouter()

class ChatSessionCreate(BaseModel):
    title: str

class ChatMessageRequest(BaseModel):
    text: str

@router.post("/projects/{project_id}/chat/sessions")
async def create_chat_session(
    project_id: uuid.UUID,
    session_in: ChatSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    new_session = ChatSession(
        project_id=project_id,
        title=session_in.title
    )
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    return {
        "id": str(new_session.id),
        "project_id": str(project_id),
        "title": new_session.title,
        "created_at": new_session.created_at.isoformat()
    }

@router.get("/projects/{project_id}/chat/sessions")
async def list_chat_sessions(
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
        select(ChatSession).filter(ChatSession.project_id == project_id).order_by(ChatSession.created_at.desc())
    )
    sessions = result.scalars().all()
    return [{
        "id": str(s.id),
        "project_id": str(s.project_id),
        "title": s.title,
        "created_at": s.created_at.isoformat()
    } for s in sessions]

@router.get("/projects/{project_id}/chat/sessions/{session_id}/messages")
async def list_chat_messages(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    session_result = await db.execute(
        select(ChatSession).filter(ChatSession.id == session_id, ChatSession.project_id == project_id)
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Chat session not found")

    result = await db.execute(
        select(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc())
    )
    messages = result.scalars().all()
    
    out = []
    for m in messages:
        citations_list = []
        if m.citations:
            try:
                citations_list = json.loads(m.citations)
            except Exception:
                pass
        out.append({
            "id": str(m.id),
            "session_id": str(m.session_id),
            "sender": m.sender,
            "text": m.text,
            "citations": citations_list,
            "created_at": m.created_at.isoformat()
        })
    return out

@router.post("/projects/{project_id}/chat/sessions/{session_id}/messages")
async def send_chat_message(
    project_id: uuid.UUID,
    session_id: uuid.UUID,
    req: ChatMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found or unauthorized")

    session_result = await db.execute(
        select(ChatSession).filter(ChatSession.id == session_id, ChatSession.project_id == project_id)
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Chat session not found")

    return await generate_chat_response(db, str(project_id), str(session_id), req.text)
