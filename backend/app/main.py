from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import text
from app.core.config import settings
from app.core.database import get_db
from app.api.endpoints import router as api_router
from app.core.logger import LoggingMiddleware

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

app.add_middleware(LoggingMiddleware)


# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://localhost:3000",
        "https://frontend-eight-eosin-72.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    db_status = "unreachable"
    try:
        # Ping the database
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        print(f"Database health check failed: {e}")
        
    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "service": settings.PROJECT_NAME,
        "database": db_status
    }

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
async def root():
    return {"message": "Welcome to the Pensive AI Book RAG System API"}
