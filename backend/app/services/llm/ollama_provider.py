import asyncio
import ollama
from app.core.config import settings
from app.services.llm.base import LLMProvider

class OllamaProvider(LLMProvider):
    def __init__(self):
        self.host = settings.OLLAMA_BASE_URL
        self.model = settings.OLLAMA_MODEL

    async def generate(
        self,
        system_prompt: str,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4000
    ) -> str:
        def _call():
            client = ollama.Client(host=self.host)
            res = client.chat(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                options={
                    "temperature": temperature,
                    "num_predict": max_tokens
                }
            )
            return res['message']['content']

        return await asyncio.to_thread(_call)

    async def generate_chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> str:
        def _call():
            client = ollama.Client(host=self.host)
            res = client.chat(
                model=self.model,
                messages=messages,
                options={
                    "temperature": temperature,
                    "num_predict": max_tokens
                }
            )
            return res['message']['content']

        return await asyncio.to_thread(_call)

    async def generate_stream(
        self,
        system_prompt: str,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4000
    ):
        client = ollama.AsyncClient(host=self.host)
        response = await client.chat(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            stream=True,
            options={
                "temperature": temperature,
                "num_predict": max_tokens
            }
        )
        async for chunk in response:
            yield chunk['message']['content']
