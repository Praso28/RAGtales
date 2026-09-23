import asyncio
from openai import OpenAI
from app.core.config import settings
from app.services.llm.base import LLMProvider

class OpenAIProvider(LLMProvider):
    def __init__(self):
        self.client = OpenAI(
            api_key=settings.OPENAI_API_KEY or ""
        )
        self.model = "gpt-4o-mini"

    async def generate(
        self,
        system_prompt: str,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4000
    ) -> str:
        def _call():
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                temperature=temperature,
                max_tokens=max_tokens
            )
            return completion.choices[0].message.content

        return await asyncio.to_thread(_call)

    async def generate_chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> str:
        def _call():
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens
            )
            return completion.choices[0].message.content

        return await asyncio.to_thread(_call)
