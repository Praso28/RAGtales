import os
import json
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models.project import Project, Document, Draft, User, AIAuditLog
from app.core.auth import require_admin
from app.core.config import settings
from app.tasks.backup import create_database_backup, BACKUP_DIR

router = APIRouter()

class LLMConfigUpdate(BaseModel):
    provider: str

class UserRoleUpdate(BaseModel):
    role: str

# Existing Monitoring / Backup Endpoints
@router.get("/monitoring/stats")
async def get_monitoring_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    proj_result = await db.execute(select(Project))
    projects = proj_result.scalars().all()
    project_ids = [p.id for p in projects]
    
    if project_ids:
        doc_result = await db.execute(select(Document).filter(Document.project_id.in_(project_ids)))
        documents = doc_result.scalars().all()
        draft_result = await db.execute(select(Draft).filter(Draft.project_id.in_(project_ids)))
        drafts = draft_result.scalars().all()
    else:
        documents = []
        drafts = []
    
    total_size_bytes = 0
    for doc in documents:
        if os.path.exists(doc.storage_path):
            try:
                total_size_bytes += os.path.getsize(doc.storage_path)
            except Exception:
                pass
                
    doc_statuses = {"READY": 0, "PROCESSING": 0, "FAILED": 0}
    for doc in documents:
        status = doc.status if doc.status in doc_statuses else "PROCESSING"
        doc_statuses[status] += 1
        
    return {
        "projects_count": len(projects),
        "documents_count": len(documents),
        "drafts_count": len(drafts),
        "storage_size_kb": round(total_size_bytes / 1024, 2),
        "document_status_breakdown": doc_statuses,
        "database_health": "healthy"
    }

@router.post("/monitoring/backup")
async def trigger_backup(current_user: User = Depends(require_admin)):
    try:
        filename = await create_database_backup()
        return {"status": "success", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup generation failed: {str(e)}")

@router.get("/monitoring/backups")
async def list_backups(current_user: User = Depends(require_admin)):
    os.makedirs(BACKUP_DIR, exist_ok=True)
    backups_list = []
    for entry in os.scandir(BACKUP_DIR):
        if entry.is_file() and entry.name.endswith(".zip"):
            stat = entry.stat()
            backups_list.append({
                "filename": entry.name,
                "size_kb": round(stat.st_size / 1024, 2),
                "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat()
            })
    backups_list.sort(key=lambda x: x["created_at"], reverse=True)
    return backups_list

@router.get("/monitoring/backups/{filename}")
async def download_backup(filename: str, current_user: User = Depends(require_admin)):
    clean_filename = os.path.basename(filename)
    file_path = os.path.join(BACKUP_DIR, clean_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Backup file not found")
    return FileResponse(
        path=file_path,
        media_type="application/zip",
        filename=clean_filename
    )

# New Sprint 8 Admin Endpoints
@router.get("/admin/audit-log")
async def get_audit_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    offset = (page - 1) * per_page
    # Query logs
    result = await db.execute(
        select(AIAuditLog)
        .order_by(AIAuditLog.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    logs = result.scalars().all()
    
    # Total count
    total_result = await db.execute(select(AIAuditLog))
    total_count = len(total_result.scalars().all()) # simple count for development
    
    return {
        "page": page,
        "per_page": per_page,
        "total_count": total_count,
        "logs": [
            {
                "id": str(log.id),
                "project_id": str(log.project_id) if log.project_id else None,
                "user_id": str(log.user_id) if log.user_id else None,
                "action": log.action,
                "prompt": log.prompt,
                "response": log.response,
                "provider": log.provider,
                "model": log.model,
                "tokens_used": log.tokens_used,
                "created_at": log.created_at.isoformat()
            } for log in logs
        ]
    }

@router.get("/admin/llm-config")
async def get_llm_config(
    current_user: User = Depends(require_admin)
):
    config_path = "llm_config.json"
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"provider": settings.LLM_PROVIDER}

@router.put("/admin/llm-config")
async def update_llm_config(
    config_in: LLMConfigUpdate,
    current_user: User = Depends(require_admin)
):
    config_path = "llm_config.json"
    provider = config_in.provider.lower()
    if provider not in ["phi4", "gemini", "openai", "ollama"]:
        raise HTTPException(status_code=400, detail="Invalid provider")
        
    config = {"provider": provider}
    try:
        with open(config_path, "w") as f:
            json.dump(config, f)
        return config
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write config: {str(e)}")

@router.get("/admin/users")
async def get_users_list(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [
        {
            "id": str(u.id),
            "username": u.username,
            "role": u.role,
            "created_at": u.created_at.isoformat()
        } for u in users
    ]

@router.put("/admin/users/{user_id}/role")
async def update_user_role(
    user_id: uuid.UUID,
    role_in: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    if role_in.role not in ["admin", "author"]:
        raise HTTPException(status_code=400, detail="Invalid role specified")
        
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.role = role_in.role
    db.add(user)
    await db.commit()
    return {"id": str(user.id), "username": user.username, "role": user.role}
