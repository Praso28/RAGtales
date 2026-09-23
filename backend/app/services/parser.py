import os
import zipfile
import re
from pypdf import PdfReader
from docx import Document as DocxDocument

def parse_pdf(file_path: str) -> str:
    """Extract text from a PDF file."""
    text_content = []
    try:
        reader = PdfReader(file_path)
        for page in reader.pages:
            text = page.extract_text()
            if text:
                text_content.append(text)
    except Exception as e:
        print(f"Error parsing PDF {file_path}: {e}")
    return "\n\n".join(text_content)

def parse_docx(file_path: str) -> str:
    """Extract text from a DOCX file."""
    text_content = []
    try:
        doc = DocxDocument(file_path)
        for para in doc.paragraphs:
            if para.text.strip():
                text_content.append(para.text)
    except Exception as e:
        print(f"Error parsing DOCX {file_path}: {e}")
    return "\n".join(text_content)

def parse_txt(file_path: str) -> str:
    """Extract text from a TXT file."""
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception as e:
        print(f"Error parsing TXT {file_path}: {e}")
        return ""

def parse_epub(file_path: str) -> str:
    """Extract text from an EPUB file (essentially a zip of XHTML files)."""
    text_content = []
    try:
        with zipfile.ZipFile(file_path, 'r') as zip_ref:
            # Look for xhtml/html files inside the zip
            for name in zip_ref.namelist():
                if name.endswith(('.xhtml', '.html', '.htm')):
                    with zip_ref.open(name) as f:
                        raw_content = f.read().decode('utf-8', errors='ignore')
                        # Strip html tags
                        clean_text = re.sub(r'<[^>]+>', ' ', raw_content)
                        # Normalize whitespace
                        clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                        if clean_text:
                            text_content.append(clean_text)
    except Exception as e:
        print(f"Error parsing EPUB {file_path}: {e}")
    return "\n\n".join(text_content)

def extract_text(file_path: str) -> str:
    """Router function to extract text based on file extension."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return parse_pdf(file_path)
    elif ext == ".docx":
        return parse_docx(file_path)
    elif ext == ".txt":
        return parse_txt(file_path)
    elif ext == ".epub":
        return parse_epub(file_path)
    else:
        # Fallback to reading as raw text
        return parse_txt(file_path)
