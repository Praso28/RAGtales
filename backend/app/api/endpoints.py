from fastapi import APIRouter
from app.api.routers import auth, projects, documents, chat, admin, outlines, chapters, export

router = APIRouter()

# Register all modular routers
router.include_router(auth.router)
router.include_router(projects.router)
router.include_router(documents.router)
router.include_router(chat.router)
router.include_router(admin.router)
router.include_router(outlines.router)
router.include_router(chapters.router)
router.include_router(export.router)
