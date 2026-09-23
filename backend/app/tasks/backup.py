import os
import json
import uuid
import zipfile
import glob
from datetime import datetime
from sqlalchemy.future import select
from app.core.database import AsyncSessionLocal
from app.models.project import User, Project, Document, Draft, ChatSession, ChatMessage

BACKUP_DIR = "/app/backups" if os.path.exists("/app") else os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "backups")

def json_serializer(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, uuid.UUID):
        return str(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

async def create_database_backup() -> str:
    """
    Backup all table data to a zip file containing JSON data.
    Maintains last 5 backups.
    """
    os.makedirs(BACKUP_DIR, exist_ok=True)
    
    backup_data = {}
    async with AsyncSessionLocal() as db:
        tables = [User, Project, Document, Draft, ChatSession, ChatMessage]
        for table in tables:
            result = await db.execute(select(table))
            rows = result.scalars().all()
            
            table_name = table.__tablename__
            backup_data[table_name] = []
            
            for row in rows:
                row_dict = {}
                for col in table.__table__.columns:
                    val = getattr(row, col.name)
                    row_dict[col.name] = val
                backup_data[table_name].append(row_dict)
                
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    json_filename = f"backup_{timestamp}.json"
    zip_filename = f"backup_{timestamp}.zip"
    
    json_path = os.path.join(BACKUP_DIR, json_filename)
    zip_path = os.path.join(BACKUP_DIR, zip_filename)
    
    # Write json
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(backup_data, f, default=json_serializer, indent=2)
        
    # Zip it
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        zipf.write(json_path, json_filename)
        
    # Remove temp json file
    if os.path.exists(json_path):
        os.remove(json_path)
        
    # Rotate: keep last 5 backups
    backup_files = glob.glob(os.path.join(BACKUP_DIR, "backup_*.zip"))
    backup_files.sort(key=os.path.getmtime)
    
    while len(backup_files) > 5:
        oldest = backup_files.pop(0)
        try:
            os.remove(oldest)
        except Exception as e:
            print(f"Error removing old backup {oldest}: {e}")
            
    return zip_filename
