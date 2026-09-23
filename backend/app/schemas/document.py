from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional

class DocumentBase(BaseModel):
    filename: str
    document_type: str
    status: str = "PENDING"

class DocumentCreate(DocumentBase):
    project_id: UUID
    storage_path: str

class DocumentResponse(DocumentBase):
    id: UUID
    project_id: UUID
    storage_path: str
    bucket: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
