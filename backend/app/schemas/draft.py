from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime

class DraftBase(BaseModel):
    title: str
    content: str

class DraftCreate(DraftBase):
    project_id: UUID

class DraftUpdate(BaseModel):
    title: str
    content: str

class DraftResponse(DraftBase):
    id: UUID
    project_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
