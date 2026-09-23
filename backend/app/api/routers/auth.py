from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models.project import User
from app.core.auth import get_password_hash, verify_password, create_access_token

router = APIRouter()

class UserAuthRequest(BaseModel):
    username: str
    password: str

@router.post("/auth/register")
async def register_user(req: UserAuthRequest, db: AsyncSession = Depends(get_db)):
    existing_result = await db.execute(select(User).filter(User.username == req.username))
    if existing_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already registered")
        
    hashed = get_password_hash(req.password)
    new_user = User(username=req.username, hashed_password=hashed)
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return {"id": str(new_user.id), "username": new_user.username}

@router.post("/auth/token")
async def login_for_token(req: UserAuthRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).filter(User.username == req.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
        
    token = create_access_token(user.id, role=user.role)
    return {"access_token": token, "token_type": "bearer", "username": user.username, "role": user.role}
