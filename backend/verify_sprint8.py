import asyncio
import os
import sys
import uuid
import json
from datetime import datetime
import httpx
from sqlalchemy.future import select

# Set python path to find app module
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import AsyncSessionLocal
from app.models.project import User, Project, Chapter, Outline, AIAuditLog, Document

BASE_URL = "http://127.0.0.1:8080/api/v1"

async def test_end_to_end():
    async with httpx.AsyncClient(timeout=600.0) as client:
        # Check backend health first
        try:
            health_resp = await client.get("http://127.0.0.1:8080/health")
            print(f"Health check status: {health_resp.status_code}, content: {health_resp.json()}")
        except Exception as e:
            print(f"Backend is not running at http://127.0.0.1:8080/health. Error: {e}")
            print("Please ensure the FastAPI backend is running before running this verification script.")
            return False

        print("\n=== STARTING SPRINT 8 VERIFICATION ===\n")
        
        # 1. Register and Login Author
        username = f"verify_author_{int(datetime.utcnow().timestamp())}"
        password = "testpassword123"
        print(f"[Step 1] Registering author user: {username}...")
        reg_resp = await client.post(f"{BASE_URL}/auth/register", json={"username": username, "password": password})
        assert reg_resp.status_code == 200, f"Register failed: {reg_resp.text}"
        print("Author registered successfully.")

        print("[Step 2] Logging in...")
        login_resp = await client.post(f"{BASE_URL}/auth/token", json={"username": username, "password": password})
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token_data = login_resp.json()
        author_token = token_data["access_token"]
        headers = {"Authorization": f"Bearer {author_token}"}
        print("Login token retrieved.")

        # 2. Create Project
        print("\n[Step 3] Creating new project...")
        proj_name = f"Test Book - {int(datetime.utcnow().timestamp())}"
        proj_resp = await client.post(
            f"{BASE_URL}/projects", 
            json={"name": proj_name, "description": "A book created for verifying Sprint 8 pipeline features."},
            headers=headers
        )
        assert proj_resp.status_code == 200, f"Project creation failed: {proj_resp.text}"
        project = proj_resp.json()
        project_id = project["id"]
        print(f"Project created with ID: {project_id}")

        # 3. Book Context & Flags Test
        print("\n[Step 4] Saving and retrieving book context...")
        context_data = {
            "title": "TBD", # trigger title flag
            "subtitle": "Short", # trigger subtitle flag
            "audience": "Kids", # trigger audience flag
            "objective": "To teach", # trigger objective flag
            "reader_before": "Sad", # trigger reader_before flag
            "reader_after": "Happy", # trigger reader_after flag
            "tone": "Playful"
        }
        
        # POST context
        ctx_resp = await client.post(f"{BASE_URL}/projects/{project_id}/context", json=context_data, headers=headers)
        assert ctx_resp.status_code == 200, f"Save context failed: {ctx_resp.text}"
        print("Initial book context saved.")

        # GET flags
        flags_resp = await client.get(f"{BASE_URL}/projects/{project_id}/context/flags", headers=headers)
        assert flags_resp.status_code == 200, f"Get flags failed: {flags_resp.text}"
        flags = flags_resp.json()
        print("Retrieved context flags (expecting multiple warnings):")
        for field, detail in flags.items():
            print(f"  - {field}: {detail['warning']} (Flag: {detail['flag']})")
        assert len(flags) > 0, "Expected validation warnings for placeholders and short descriptions"

        # Update to clean context
        clean_context = {
            "title": proj_name,
            "subtitle": "The Ultimate Guide to Automated Software Verification",
            "audience": "Professional software developers and QA automation engineers",
            "objective": "Establish a bulletproof test-driven workflow using modern asynchronous Python testing strategies",
            "reader_before": "Struggling with flaky API endpoints and manual verification checklists",
            "reader_after": "Confident in automating comprehensive validation scripts using modular architectures",
            "tone": "Analytical, encouraging, and detailed"
        }
        update_resp = await client.patch(f"{BASE_URL}/projects/{project_id}/context", json=clean_context, headers=headers)
        assert update_resp.status_code == 200, f"Update context failed: {update_resp.text}"
        print(f"PATCH response JSON: {update_resp.json()}")
        
        # Direct database check
        async with AsyncSessionLocal() as db:
            db_proj = await db.get(Project, uuid.UUID(project_id))
            print(f"DIRECT DATABASE READ: book_context = {db_proj.book_context}")
        
        # Verify flags cleared
        flags_resp_2 = await client.get(f"{BASE_URL}/projects/{project_id}/context/flags", headers=headers)
        flags_2 = flags_resp_2.json()
        print(f"Flags after updating with detailed context: {flags_2}")
        assert len(flags_2) == 0, f"Flags should be completely resolved now, but got: {flags_2}"

        # 4. Upload Documents to Buckets
        print("\n[Step 5] Uploading documents to specific buckets...")
        
        # Document A: Author Material
        author_doc_content = "This document contains core technical reference notes. Automated test verifications are highly productive."
        files_a = {"file": ("author_notes.txt", author_doc_content, "text/plain")}
        doc_a_resp = await client.post(
            f"{BASE_URL}/projects/{project_id}/upload",
            data={"document_type": "AUTHOR_DOC", "bucket": "author_material"},
            files=files_a,
            headers=headers
        )
        assert doc_a_resp.status_code == 200, f"Author material upload failed: {doc_a_resp.text}"
        doc_a = doc_a_resp.json()
        print(f"Document A (AUTHOR_DOC) uploaded to bucket '{doc_a['bucket']}' (Status: {doc_a['status']})")

        # Document B: Market Research
        market_doc_content = "Competitor books often skip detailed asyncio Python code examples, creating a massive gap in professional literature."
        files_b = {"file": ("competitor_analysis.txt", market_doc_content, "text/plain")}
        doc_b_resp = await client.post(
            f"{BASE_URL}/projects/{project_id}/upload",
            data={"document_type": "COMPETITOR_DOC", "bucket": "market_research"},
            files=files_b,
            headers=headers
        )
        assert doc_b_resp.status_code == 200, f"Market research upload failed: {doc_b_resp.text}"
        doc_b = doc_b_resp.json()
        print(f"Document B (COMPETITOR_DOC) uploaded to bucket '{doc_b['bucket']}' (Status: {doc_b['status']})")

        # Wait a moment for background indexing task
        print("Waiting 3 seconds for background parser and ChromaDB indexing...")
        await asyncio.sleep(3)

        # 5. Generate and Accept Outline
        print("\n[Step 6] Generating outline...")
        outline_resp = await client.post(f"{BASE_URL}/projects/{project_id}/outline/generate", headers=headers)
        assert outline_resp.status_code == 200, f"Outline generation failed: {outline_resp.text}"
        outline = outline_resp.json()
        print(f"Outline generated successfully with {len(outline['structure'])} chapters.")
        for idx, chap in enumerate(outline['structure'][:2]):
            print(f"  - Chapter {idx+1}: {chap.get('title')} (Gaps: {chap.get('gaps')})")

        # Save outline as accepted
        print("Accepting/updating outline status to accepted...")
        save_outline_resp = await client.put(
            f"{BASE_URL}/projects/{project_id}/outline",
            json={"structure": outline["structure"], "status": "accepted"},
            headers=headers
        )
        assert save_outline_resp.status_code == 200, f"Outline update failed: {save_outline_resp.text}"
        print(f"Outline status set to: {save_outline_resp.json()['status']}")

        print("Waiting 15 seconds to avoid LLM API rate limits...")
        await asyncio.sleep(15)

        # 6. Chapter CRUD
        print("\n[Step 7] Creating a chapter record manually...")
        new_chap_resp = await client.post(
            f"{BASE_URL}/projects/{project_id}/chapters",
            json={"title": "Chapter 1: The Foundations of Testing", "order": 1},
            headers=headers
        )
        assert new_chap_resp.status_code == 200, f"Chapter creation failed: {new_chap_resp.text}"
        chapter = new_chap_resp.json()
        chapter_id = chapter["id"]
        print(f"Chapter created with ID: {chapter_id}")

        # 7. Chapter Generation: Quick Mode
        print("Waiting 30 seconds to avoid LLM API rate limits...")
        await asyncio.sleep(30)
        print("\n[Step 8] Generating chapter draft via Quick Mode...")
        quick_gen_resp = await client.post(
            f"{BASE_URL}/projects/{project_id}/chapters/generate/quick",
            json={
                "chapter_id": chapter_id,
                "prompt": "Draft a section focusing on the benefits of writing unit tests early, referencing our author notes.",
                "tone": "Analytical",
                "audience": "Developers"
            },
            headers=headers
        )
        assert quick_gen_resp.status_code == 200, f"Quick generation failed: {quick_gen_resp.text}"
        quick_data = quick_gen_resp.json()
        print(f"Quick generation succeeded!")
        print(f"Originality Report: {quick_data.get('originality_report')}")
        print(f"Draft Preview (first 150 chars): {quick_data['chapter']['content'][:150]}...")

        # 8. Chapter Generation: Guided Mode
        print("\n[Step 9] Creating another chapter for Guided Q&A...")
        chap_guided_resp = await client.post(
            f"{BASE_URL}/projects/{project_id}/chapters",
            json={"title": "Chapter 2: Intermediate Automation Strategies", "order": 2},
            headers=headers
        )
        assert chap_guided_resp.status_code == 200
        guided_chapter_id = chap_guided_resp.json()["id"]

        print("Starting Guided session...")
        g_start = await client.post(
            f"{BASE_URL}/projects/{project_id}/chapters/generate/guided/start",
            json={"chapter_id": guided_chapter_id},
            headers=headers
        )
        assert g_start.status_code == 200
        step_1 = g_start.json()
        print(f"Step 1 Question: {step_1['question']}")

        print("Answering question 1...")
        g_ans_1 = await client.post(
            f"{BASE_URL}/projects/{project_id}/chapters/generate/guided/answer",
            json={
                "chapter_id": guided_chapter_id,
                "answers": [{"question": step_1["question"], "answer": "The core message is scalability in tests."}]
            },
            headers=headers
        )
        assert g_ans_1.status_code == 200
        step_2 = g_ans_1.json()
        print(f"Step 2 Question: {step_2['question']}")

        print("Answering question 2...")
        g_ans_2 = await client.post(
            f"{BASE_URL}/projects/{project_id}/chapters/generate/guided/answer",
            json={
                "chapter_id": guided_chapter_id,
                "answers": step_2["answers"] + [{"question": step_2["question"], "answer": "Use real-world pytest fixtures."}]
            },
            headers=headers
        )
        assert g_ans_2.status_code == 200
        step_3 = g_ans_2.json()
        print(f"Step 3 Question: {step_3['question']}")

        print("Answering question 3...")
        g_ans_3 = await client.post(
            f"{BASE_URL}/projects/{project_id}/chapters/generate/guided/answer",
            json={
                "chapter_id": guided_chapter_id,
                "answers": step_3["answers"] + [{"question": step_3["question"], "answer": "We must discuss mock.patch safety."}]
            },
            headers=headers
        )
        assert g_ans_3.status_code == 200
        step_4 = g_ans_3.json()
        print(f"Done state: {step_4.get('done')}")

        print("Waiting 45 seconds to avoid LLM API rate limits...")
        await asyncio.sleep(45)
        print("Finishing Guided session to generate text...")
        g_finish = await client.post(
            f"{BASE_URL}/projects/{project_id}/chapters/generate/guided/finish",
            json={
                "chapter_id": guided_chapter_id,
                "answers": step_4["answers"],
                "tone": "Encouraging",
                "audience": "Developers"
            },
            headers=headers
        )
        assert g_finish.status_code == 200, f"Guided finish failed: {g_finish.text}"
        guided_data = g_finish.json()
        print("Guided generation finished successfully!")
        print(f"Originality Report: {guided_data.get('originality_report')}")

        # 9. Exports
        print("\n[Step 10] Testing PDF and DOCX Exports...")
        # Chapter DOCX
        docx_chap = await client.get(f"{BASE_URL}/projects/{project_id}/export/chapter/{chapter_id}/docx", headers=headers)
        assert docx_chap.status_code == 200
        assert len(docx_chap.content) > 0
        print("  - Chapter DOCX export OK")

        # Chapter PDF
        pdf_chap = await client.get(f"{BASE_URL}/projects/{project_id}/export/chapter/{chapter_id}/pdf", headers=headers)
        assert pdf_chap.status_code == 200
        assert len(pdf_chap.content) > 0
        print("  - Chapter PDF export OK")

        # Full Book DOCX
        docx_book = await client.get(f"{BASE_URL}/projects/{project_id}/export/book/docx", headers=headers)
        assert docx_book.status_code == 200
        assert len(docx_book.content) > 0
        print("  - Full Book DOCX export OK")

        # Full Book PDF
        pdf_book = await client.get(f"{BASE_URL}/projects/{project_id}/export/book/pdf", headers=headers)
        assert pdf_book.status_code == 200
        assert len(pdf_book.content) > 0
        print("  - Full Book PDF export OK")

        # 10. Admin Endpoints Verification
        print("\n[Step 11] Escalating user to admin in DB to test admin views...")
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).filter(User.username == username))
            db_user = result.scalar_one_or_none()
            assert db_user is not None
            db_user.role = "admin"
            await db.commit()
            print("User upgraded to admin in database.")

        # Re-token to get admin credentials
        login_resp_admin = await client.post(f"{BASE_URL}/auth/token", json={"username": username, "password": password})
        admin_token = login_resp_admin.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        print("Testing Admin audit-log access...")
        audit_resp = await client.get(f"{BASE_URL}/admin/audit-log", headers=admin_headers)
        assert audit_resp.status_code == 200
        audit_data = audit_resp.json()
        print(f"Audit log returned {audit_data['total_count']} logs.")
        # Ensure at least our generations are logged
        actions_logged = [log["action"] for log in audit_data["logs"]]
        print(f"Logged actions: {actions_logged}")
        assert "generate_chapter_quick" in actions_logged or "generate_chapter_guided" in actions_logged

        print("Testing Admin LLM config endpoints...")
        config_get = await client.get(f"{BASE_URL}/admin/llm-config", headers=admin_headers)
        assert config_get.status_code == 200
        print(f"Current LLM Config: {config_get.json()}")

        config_put = await client.put(f"{BASE_URL}/admin/llm-config", json={"provider": "gemini"}, headers=admin_headers)
        assert config_put.status_code == 200
        print(f"Updated LLM Config: {config_put.json()}")

        # Clean up database test entries (optional but nice)
        print("\n[Step 12] Cleaning up test project and user from database...")
        async with AsyncSessionLocal() as db:
            # Delete audit logs
            logs_res = await db.execute(select(AIAuditLog).filter(AIAuditLog.user_id == db_user.id))
            for l in logs_res.scalars().all():
                await db.delete(l)
            # Delete chapters
            chaps_res = await db.execute(select(Chapter).filter(Chapter.project_id == project_id))
            for c in chaps_res.scalars().all():
                await db.delete(c)
            # Delete outline
            out_res = await db.execute(select(Outline).filter(Outline.project_id == project_id))
            for o in out_res.scalars().all():
                await db.delete(o)
            # Delete documents
            docs_res = await db.execute(select(Document).filter(Document.project_id == project_id))
            for d in docs_res.scalars().all():
                await db.delete(d)
            # Delete project
            proj_obj = await db.get(Project, uuid.UUID(project_id))
            if proj_obj:
                await db.delete(proj_obj)
            # Delete user
            await db.delete(db_user)
            await db.commit()
            print("Cleanup finished successfully.")

        print("\n=== SPRINT 8 VERIFICATION COMPLETED SUCCESSFULLY ===")
        return True

if __name__ == "__main__":
    success = asyncio.run(test_end_to_end())
    if not success:
        sys.exit(1)
