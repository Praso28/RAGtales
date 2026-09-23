import json
import uuid
from typing import List, Dict, Any
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.project import ChatSession, ChatMessage
from app.services.llm import get_llm_provider
from app.services.rag_service import retrieve_context

async def generate_chat_response(
    db: AsyncSession,
    project_id: str,
    session_id: str,
    user_message: str
) -> Dict[str, Any]:
    """
    RAG-enabled chat assistant:
    1. Save user message.
    2. Retrieve relevant RAG context.
    3. Construct system prompt and history.
    4. Call Azure Phi-4.
    5. Save & return assistant response.
    """
    # 1. Save User Message
    new_user_msg = ChatMessage(
        session_id=uuid.UUID(session_id),
        sender="user",
        text=user_message,
        citations=None
    )
    db.add(new_user_msg)
    await db.commit()

    # 2. Retrieve context from vector store
    context_chunks = []
    citations = []
    try:
        # We query the vector database for matching source materials
        # Let's get top 3 chunks for conversational queries
        raw_results = await retrieve_context(project_id, user_message, top_k=3)
        # Note: retrieve_context returns chunks as strings.
        # If we have structured citation metadata stored, we can extract it.
        # For simple citation display, let's pass chunks as context and store citations reference info.
        for idx, chunk in enumerate(raw_results):
            context_chunks.append(chunk)
            citations.append({
                "index": idx + 1,
                "text_snippet": chunk[:150] + "...",
                "source": "Project Knowledge Base"
            })
    except Exception as e:
        print(f"Error retrieving RAG context for chat: {e}")

    # 3. Load Chat History (last 8 messages for context memory)
    history_result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == uuid.UUID(session_id))
        .order_by(ChatMessage.created_at.asc())
    )
    all_msgs = history_result.scalars().all()
    
    messages_payload = []
    
    # System system instructions
    context_str = "\n\n---\n\n".join(context_chunks) if context_chunks else "No source materials found matching the query."
    system_prompt = (
        "You are 'Pensive Assistant', an intelligent, helpful RAG writing companion. "
        "Your goal is to answer the user's questions accurately based on the provided project documents. "
        "Always cite your sources and stick to the facts in the context when possible.\n\n"
        f"Available Context from Project Documents:\n{context_str}\n\n"
        "Guidelines:\n"
        "- Be conversational, supportive, and clear.\n"
        "- If the answer cannot be found in the context, state that but attempt to give a helpful reply using general knowledge while clearly indicating it is outside the context.\n"
        "- Refer to the context index numbers (e.g. [1], [2]) if citing specific details."
    )
    messages_payload.append({"role": "system", "content": system_prompt})

    # Add historical messages (excluding the last one which is our current query)
    for msg in all_msgs[:-1]:
        messages_payload.append({
            "role": msg.sender,
            "content": msg.text
        })

    # Add current query
    messages_payload.append({"role": "user", "content": user_message})

    # 4. Call Azure Phi-4
    assistant_text = ""
    try:
        provider = get_llm_provider()
        assistant_text = await provider.generate_chat(
            messages=messages_payload,
            temperature=0.7,
            max_tokens=1500
        )
    except Exception as e:
        print(f"Azure Phi-4 call failed in chat_service: {e}")
        assistant_text = f"I'm sorry, I encountered an error communicating with the generation LLM server. (Error details: {str(e)})"

    # 5. Save & Return Assistant Response
    new_assistant_msg = ChatMessage(
        session_id=uuid.UUID(session_id),
        sender="assistant",
        text=assistant_text,
        citations=json.dumps(citations)
    )
    db.add(new_assistant_msg)
    await db.commit()
    await db.refresh(new_assistant_msg)

    return {
        "id": str(new_assistant_msg.id),
        "session_id": session_id,
        "sender": "assistant",
        "text": assistant_text,
        "citations": citations,
        "created_at": new_assistant_msg.created_at.isoformat()
    }
