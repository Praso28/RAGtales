from abc import ABC, abstractmethod

class LLMProvider(ABC):
    @abstractmethod
    async def generate(
        self,
        system_prompt: str,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4000
    ) -> str:
        """Generate text from system_prompt and user prompt."""
        pass

    @abstractmethod
    async def generate_chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> str:
        """Generate text from a list of chat messages (role: system/user/assistant)."""
        pass

    async def generate_stream(
        self,
        system_prompt: str,
        prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4000
    ):
        """Generate text stream from system_prompt and user prompt, yielding tokens."""
        raise NotImplementedError()
