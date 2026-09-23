import functools
import logging
from typing import Any, Dict, Callable

logger = logging.getLogger(__name__)

# In-memory cache structure:
# _cache[project_id] = {
#     "rag": { (query, bucket, top_k): result_chunks },
#     "response": { (func_name, sorted_params_tuple): response_data }
# }
_cache: Dict[str, Dict[str, Dict[Any, Any]]] = {}

def get_project_cache(project_id: str) -> Dict[str, Dict[Any, Any]]:
    pid = str(project_id)
    if pid not in _cache:
        _cache[pid] = {
            "rag": {},
            "response": {}
        }
    return _cache[pid]

def invalidate_project_cache(project_id: str):
    pid = str(project_id)
    if pid in _cache:
        del _cache[pid]
        logger.info(f"Cache invalidated for project {pid}")

def cache_rag():
    """
    Decorator to cache RAG retrieve_context results per project.
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(project_id: str, query: str, bucket: str = "author_material", top_k: int = 5, *args, **kwargs):
            pid = str(project_id)
            p_cache = get_project_cache(pid)["rag"]
            cache_key = (query, bucket, top_k)
            
            if cache_key in p_cache:
                logger.info(f"RAG Cache HIT for project {pid}, key {cache_key}")
                return p_cache[cache_key]
                
            logger.info(f"RAG Cache MISS for project {pid}, key {cache_key}")
            result = await func(project_id, query, bucket, top_k, *args, **kwargs)
            p_cache[cache_key] = result
            return result
        return wrapper
    return decorator

def cache_response():
    """
    Decorator to cache FastAPI GET response data per project.
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            project_id = kwargs.get("project_id") or (args[0] if args else None)
            if not project_id:
                return await func(*args, **kwargs)
                
            pid = str(project_id)
            p_cache = get_project_cache(pid)["response"]
            
            # Serialize parameters excluding database sessions and current users
            key_parts = []
            for k, v in kwargs.items():
                if k not in ["db", "current_user", "background_tasks"]:
                    key_parts.append((k, str(v)))
            cache_key = (func.__name__, tuple(sorted(key_parts)))
            
            if cache_key in p_cache:
                logger.info(f"Response Cache HIT for project {pid}, function {func.__name__}")
                return p_cache[cache_key]
                
            logger.info(f"Response Cache MISS for project {pid}, function {func.__name__}")
            result = await func(*args, **kwargs)
            p_cache[cache_key] = result
            return result
        return wrapper
    return decorator
