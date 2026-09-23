import os
from app.services.storage.base import StorageProvider
from app.services.storage.local_provider import LocalStorageProvider
from app.services.storage.s3_provider import S3StorageProvider

def get_storage_provider() -> StorageProvider:
    """
    Returns the active StorageProvider instance.
    Checks environment config to decide between 'local' and 's3'.
    """
    provider_type = os.environ.get("STORAGE_PROVIDER", "local").lower()
    if provider_type == "s3":
        return S3StorageProvider()
    return LocalStorageProvider()
