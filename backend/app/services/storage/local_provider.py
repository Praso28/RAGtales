import os
from app.services.storage.base import StorageProvider

class LocalStorageProvider(StorageProvider):
    def __init__(self, upload_dir: str = None):
        if not upload_dir:
            self.upload_dir = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
                "uploads"
            )
        else:
            self.upload_dir = upload_dir
        os.makedirs(self.upload_dir, exist_ok=True)

    async def save_file(self, file_path: str, content: bytes) -> str:
        if not os.path.isabs(file_path):
            dest_path = os.path.join(self.upload_dir, os.path.basename(file_path))
        else:
            dest_path = file_path
            
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        with open(dest_path, "wb") as buffer:
            buffer.write(content)
        return dest_path

    async def read_file(self, file_path: str) -> bytes:
        if not os.path.isabs(file_path):
            src_path = os.path.join(self.upload_dir, os.path.basename(file_path))
        else:
            src_path = file_path
            
        with open(src_path, "rb") as buffer:
            return buffer.read()

    async def delete_file(self, file_path: str) -> bool:
        if not os.path.isabs(file_path):
            src_path = os.path.join(self.upload_dir, os.path.basename(file_path))
        else:
            src_path = file_path
            
        if os.path.exists(src_path):
            try:
                os.remove(src_path)
                return True
            except Exception as e:
                print(f"LocalStorageProvider error: {e}")
                return False
        return False
