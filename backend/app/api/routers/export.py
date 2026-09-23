import io
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.core.database import get_db
from app.models.project import Project, Chapter, User
from app.core.auth import get_current_user

# ReportLab imports for PDF
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

# Python-docx imports for DOCX
from docx import Document

router = APIRouter()

@router.get("/projects/{project_id}/export/chapter/{chapter_id}/docx")
async def export_chapter_docx(
    project_id: uuid.UUID,
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify project
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Load chapter
    chap_result = await db.execute(
        select(Chapter).filter(Chapter.id == chapter_id, Chapter.project_id == project_id)
    )
    chapter = chap_result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    doc = Document()
    doc.add_heading(chapter.title, level=1)
    
    # Strip HTML tags if Tippy/rich-text editor uses HTML
    content_text = chapter.content or ""
    # simple text representation
    doc.add_paragraph(content_text)

    file_stream = io.BytesIO()
    doc.save(file_stream)
    file_stream.seek(0)

    clean_filename = f"{chapter.title.replace(' ', '_')}.docx"
    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename={clean_filename}"}
    )

@router.get("/projects/{project_id}/export/chapter/{chapter_id}/pdf")
async def export_chapter_pdf(
    project_id: uuid.UUID,
    chapter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify project
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    if not proj_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    # Load chapter
    chap_result = await db.execute(
        select(Chapter).filter(Chapter.id == chapter_id, Chapter.project_id == project_id)
    )
    chapter = chap_result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=72)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'ChapterTitle',
        parent=styles['Heading1'],
        fontSize=20,
        leading=24,
        spaceAfter=20
    )
    body_style = ParagraphStyle(
        'ChapterBody',
        parent=styles['Normal'],
        fontSize=11,
        leading=16,
        spaceAfter=12
    )

    story = []
    story.append(Paragraph(chapter.title, title_style))
    story.append(Spacer(1, 12))
    
    content = chapter.content or ""
    # Simple formatting of newlines into paragraphs
    paragraphs = content.split('\n')
    for p in paragraphs:
        if p.strip():
            escaped_text = p.strip().replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            story.append(Paragraph(escaped_text, body_style))
            
    doc.build(story)
    buffer.seek(0)

    clean_filename = f"{chapter.title.replace(' ', '_')}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={clean_filename}"}
    )

@router.get("/projects/{project_id}/export/book/docx")
async def export_book_docx(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify project
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Load all chapters
    chap_result = await db.execute(
        select(Chapter).filter(Chapter.project_id == project_id).order_by(Chapter.order.asc(), Chapter.created_at.asc())
    )
    chapters = chap_result.scalars().all()

    doc = Document()
    doc.add_heading(project.name, level=0)
    if project.description:
        doc.add_paragraph(project.description)
        doc.add_page_break()

    for chap in chapters:
        doc.add_heading(chap.title, level=1)
        doc.add_paragraph(chap.content or "")
        doc.add_page_break()

    file_stream = io.BytesIO()
    doc.save(file_stream)
    file_stream.seek(0)

    clean_filename = f"{project.name.replace(' ', '_')}_Full_Book.docx"
    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename={clean_filename}"}
    )

@router.get("/projects/{project_id}/export/book/pdf")
async def export_book_pdf(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify project
    proj_result = await db.execute(
        select(Project).filter(Project.id == project_id, (Project.user_id == current_user.id) | (Project.user_id == None))
    )
    project = proj_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Load all chapters
    chap_result = await db.execute(
        select(Chapter).filter(Chapter.project_id == project_id).order_by(Chapter.order.asc(), Chapter.created_at.asc())
    )
    chapters = chap_result.scalars().all()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=72)
    
    styles = getSampleStyleSheet()
    book_title_style = ParagraphStyle(
        'BookTitle',
        parent=styles['Title'],
        fontSize=26,
        leading=32,
        spaceAfter=30
    )
    title_style = ParagraphStyle(
        'ChapterTitle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        spaceAfter=18,
        keepWithNext=True
    )
    body_style = ParagraphStyle(
        'ChapterBody',
        parent=styles['Normal'],
        fontSize=11,
        leading=16,
        spaceAfter=12
    )

    story = []
    story.append(Paragraph(project.name, book_title_style))
    if project.description:
        story.append(Spacer(1, 12))
        story.append(Paragraph(project.description, body_style))
    story.append(Spacer(1, 36))
    
    for chap in chapters:
        escaped_title = chap.title.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        story.append(Paragraph(escaped_title, title_style))
        story.append(Spacer(1, 10))
        
        content = chap.content or ""
        paragraphs = content.split('\n')
        for p in paragraphs:
            if p.strip():
                escaped_text = p.strip().replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                story.append(Paragraph(escaped_text, body_style))
        story.append(Spacer(1, 20))
            
    doc.build(story)
    buffer.seek(0)

    clean_filename = f"{project.name.replace(' ', '_')}_Full_Book.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={clean_filename}"}
    )
