from typing import List
from app.services.llm import get_llm_provider

async def generate_chapter(
    project_name: str,
    prompt: str,
    context_chunks: List[str],
    tone: str = "Informative",
    audience: str = "General Public",
    style_profile: str = ""
) -> str:
    """
    Generate a book chapter using retrieved RAG context and the configured LLM provider.
    """
    # Format the context text
    context_str = "\n\n---\n\n".join(context_chunks) if context_chunks else "No additional source context available."
    
    system_prompt = (
        "You are an expert ghostwriter and author. Your task is to draft a comprehensive, cohesive, "
        "and high-quality book chapter based on the provided source materials, prompt guidelines, and formatting style.\n\n"
        f"Project Book Title: {project_name}\n"
        f"Target Audience: {audience}\n"
        f"Writing Tone/Style: {tone}\n\n"
    )
    
    if style_profile:
        system_prompt += f"Author's Stylistic Profile Guidelines (Mimic this voice):\n{style_profile}\n\n"
        
    system_prompt += (
        "Instructions:\n"
        "1. Strictly use the facts and context provided in the source materials to support your writing.\n"
        "2. Do not fabricate facts that aren't mentioned in the source material unless it is logical creative writing (e.g. description/scene setup).\n"
        "3. Make sure the chapter flow is smooth, logical, and highly readable.\n"
        "4. Output only the final written text. Do not include introductory notes or chat commentary."
    )
    
    user_content = (
        f"Source Materials/Context:\n{context_str}\n\n"
        f"Chapter Drafting Directive:\n{prompt}\n\n"
        "Begin drafting the chapter now:"
    )
    
    try:
        provider = get_llm_provider()
        return await provider.generate(
            system_prompt=system_prompt,
            prompt=user_content,
            temperature=0.7,
            max_tokens=4000
        )
    except Exception as e:
        print(f"LLM generation call failed: {e}")
        raise e

