import os
import json
from app.core.config import settings
from app.services.llm.base import LLMProvider
from app.services.llm.phi4_provider import Phi4Provider
from app.services.llm.gemini_provider import GeminiProvider
from app.services.llm.openai_provider import OpenAIProvider
from app.services.llm.ollama_provider import OllamaProvider

def get_llm_provider(provider_override: str = None) -> LLMProvider:
    """
    Returns the configured LLMProvider instance.
    Checks for runtime config override, falling back to settings.LLM_PROVIDER.
    """
    provider = provider_override
    if not provider:
        # Check for admin-configured runtime setting file
        config_path = "llm_config.json"
        if os.path.exists(config_path):
            try:
                with open(config_path, "r") as f:
                    config = json.load(f)
                    provider = config.get("provider")
            except Exception:
                pass
                
    if not provider:
        provider = settings.LLM_PROVIDER

    provider = provider.lower() if provider else "phi4"
    
    if provider == "gemini":
        return GeminiProvider()
    elif provider == "openai":
        return OpenAIProvider()
    elif provider == "ollama":
        return OllamaProvider()
    else:
        return Phi4Provider()
