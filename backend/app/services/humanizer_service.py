import os
import urllib.request
import json
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.services.llm import get_llm_provider
from app.services.originality_service import check_originality

logger = logging.getLogger(__name__)

async def run_stage1_llm_humanizer(text: str) -> str:
    """
    Stage 1: LLM-based humanization.
    Rewrites text using a specialized prompt designed to mimic human writing and avoid detection.
    """
    if not text or not text.strip():
        return text

    prompt_path = os.path.join(os.path.dirname(__file__), 'humanizer_prompt.md')
    if os.path.exists(prompt_path):
        with open(prompt_path, 'r', encoding='utf-8') as f:
            system_prompt = f.read()
    else:
        system_prompt = (
            "You are an expert editor specializing in humanizing AI-generated content. "
            "Your goal is to rewrite the input text to make it read completely naturally, "
            "like it was written by a skilled human author. "
            "Guidelines:\n"
            "- Vary sentence structure and length (use a mix of short, medium, and long sentences).\n"
            "- Avoid typical AI buzzwords, repetitive transitions, and formulaic phrasing.\n"
            "- Maintain the exact original meaning, facts, structure, and formatting (HTML/Markdown).\n"
            "- Ensure high readability, emotional resonance, and a natural flow.\n"
            "- Output ONLY the humanized text. Do not include any notes, comments, or explanations."
        )

    try:
        provider = get_llm_provider()
        humanized = await provider.generate(
            system_prompt=system_prompt,
            prompt=text,
            temperature=0.8,
            max_tokens=4000
        )
        return humanized if humanized else text
    except Exception as e:
        logger.error(f"Stage 1 LLM humanizer failed: {e}")
        return text

async def run_stage2_external_humanizer(text: str) -> str:
    """
    Stage 2: External humanizer API (e.g. Blader).
    Runs only if HUMANIZER_API_KEY is configured.
    """
    api_key = settings.HUMANIZER_API_KEY
    if not api_key:
        return text

    url = settings.HUMANIZER_API_URL or "https://api.blader.ai/v1/humanize"
    
    # Prepare payload
    payload = {
        "text": text,
        "mode": "standard"
    }
    
    # Headers
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "x-api-key": api_key  # support multiple common API header variants
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers=headers,
            method='POST'
        )
        
        # Run request with a 15-second timeout
        with urllib.request.urlopen(req, timeout=15) as response:
            res_data = response.read().decode('utf-8')
            res_json = json.loads(res_data)
            
            # Extract result from common response formats
            # e.g., {"text": "..."}, {"humanized": "..."}, {"data": {"output": "..."}}
            if "text" in res_json:
                return res_json["text"]
            elif "humanized" in res_json:
                return res_json["humanized"]
            elif "data" in res_json and isinstance(res_json["data"], dict) and "output" in res_json["data"]:
                return res_json["data"]["output"]
            elif "output" in res_json:
                return res_json["output"]
            else:
                logger.warning(f"External humanizer response format unrecognized: {res_json}")
                return text
    except Exception as e:
        logger.error(f"Stage 2 external humanizer failed: {e}")
        return text

async def humanize_content(text: str) -> str:
    """
    Execute the two-stage humanization pipeline sequentially.
    """
    # Stage 1: LLM rewrite (always runs)
    stage1_out = await run_stage1_llm_humanizer(text)
    
    # Stage 2: External API pass (runs if configured)
    stage2_out = await run_stage2_external_humanizer(stage1_out)
    
    return stage2_out

async def humanize_and_audit(
    project_id: str,
    text: str,
    db: AsyncSession
) -> tuple[str, dict]:
    """
    Executes humanization and returns the humanized text along with an originality report.
    """
    humanized_text = await humanize_content(text)
    originality_report = await check_originality(project_id, humanized_text, db)
    return humanized_text, originality_report
