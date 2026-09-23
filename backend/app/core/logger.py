import logging
import json
import time
from datetime import datetime
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcfromtimestamp(record.created).isoformat() if record.created else datetime.utcnow().isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        # Extract extra properties
        extra_fields = {}
        for key, value in record.__dict__.items():
            if key not in {
                'args', 'asctime', 'created', 'exc_info', 'exc_text', 'filename',
                'funcName', 'levelname', 'levelno', 'lineno', 'module', 'msecs',
                'message', 'msg', 'name', 'pathname', 'process', 'processName',
                'relativeCreated', 'stack_info', 'thread', 'threadName'
            }:
                extra_fields[key] = value
        
        if extra_fields:
            log_data["extra"] = extra_fields
            
        return json.dumps(log_data)

def setup_logger():
    logger = logging.getLogger("pensive")
    logger.setLevel(logging.INFO)
    
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = JSONFormatter()
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
    return logger

logger = setup_logger()

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            
            logger.info(
                f"HTTP request {request.method} {request.url.path} - {response.status_code}",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "latency_ms": round(process_time * 1000, 2),
                    "client_ip": request.client.host if request.client else None
                }
            )
            return response
        except Exception as e:
            # Let FastAPI handle HTTPExceptions directly without raising 500 or logging as system errors
            from fastapi import HTTPException
            from starlette.exceptions import HTTPException as StarletteHTTPException
            if isinstance(e, (HTTPException, StarletteHTTPException)):
                raise
            process_time = time.time() - start_time
            logger.error(
                f"HTTP request {request.method} {request.url.path} failed: {str(e)}",
                exc_info=True,
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "latency_ms": round(process_time * 1000, 2),
                    "client_ip": request.client.host if request.client else None
                }
            )
            raise
