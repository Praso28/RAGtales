import asyncio
import google.generativeai as genai
from app.core.config import settings
from app.services.llm.base import LLMProvider

class GeminiProvider(LLMProvider):
    def __init__(self):
        api_key = settings.GEMINI_API_KEY or ""
        genai.configure(api_key=api_key)
        self.model_name = "gemini-1.5-flash"

    async def generate(
        self,
        system_prompt: str,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4000
    ) -> str:
        def _call():
            model = genai.GenerativeModel(
                model_name=self.model_name,
                system_instruction=system_prompt
            )
            response = model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens
                )
            )
            return response.text

        return await asyncio.to_thread(_call)

    async def generate_chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> str:
        # Map message formats
        system_instruction = None
        contents = []
        for m in messages:
            if m["role"] == "system":
                system_instruction = m["content"]
            else:
                # Gemini role must be either 'user' or 'model'
                role = "user" if m["role"] == "user" else "model"
                contents.append({"role": role, "parts": [m["content"]]})
                
        def _call():
            model = genai.GenerativeModel(
                model_name=self.model_name,
                system_instruction=system_instruction
            )
            response = model.generate_content(
                contents,
                generation_config=genai.types.GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens
                )
            )
            return response.text

        return await asyncio.to_thread(_call)
