from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Pensive RAG System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Database
    POSTGRES_USER: Optional[str] = "postgres"
    POSTGRES_PASSWORD: Optional[str] = "postgres"
    POSTGRES_DB: Optional[str] = "pensive_db"
    DATABASE_URL: str
    
    # ChromaDB
    CHROMA_HOST: str = "localhost"
    CHROMA_PORT: int = 8000
    
    # Security
    SECRET_KEY: str = "default_secret_key_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Azure Phi-4 Configuration
    PHI4_API_KEY: Optional[str] = None
    PHI4_ENDPOINT: str = "https://apistoopen.services.ai.azure.com/openai/v1"
    PHI4_DEPLOYMENT: str = "Phi-4"

    # Multi-LLM Configuration
    LLM_PROVIDER: str = "phi4" # Default provider: phi4, gemini, openai, ollama
    GEMINI_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:7b"

    # Humanizer Configuration
    HUMANIZER_API_KEY: Optional[str] = None
    HUMANIZER_API_URL: Optional[str] = None
    
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
