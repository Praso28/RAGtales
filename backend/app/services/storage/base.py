from abc import ABC, abstractmethod

class StorageProvider(ABC):
    @abstractmethod
    async def save_file(self, file_path: str, content: bytes) -> str:
        """Save a file to storage and return the storage path/URI."""
        pass

    @abstractmethod
    async def read_file(self, file_path: str) -> bytes:
        """Read a file from storage and return its bytes content."""
        pass

    @abstractmethod
    async def delete_file(self, file_path: str) -> bool:
        """Delete a file from storage. Returns True if successful, False otherwise."""
        pass
