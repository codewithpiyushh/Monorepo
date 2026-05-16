import time
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fpa_studio_security")

class EnterpriseLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        
        # Log the audit trail
        logger.info(
            f"Method: {request.method} | "
            f"Path: {request.url.path} | "
            f"Status: {response.status_code} | "
            f"Duration: {process_time:.4f}s"
        )
        
        response.headers["X-Process-Time"] = str(process_time)
        return response

def setup_middleware(app: FastAPI):
    # 1. Add Logging (Executes second)
    app.add_middleware(EnterpriseLoggingMiddleware)

    # 2. Add CORS (Executes FIRST! FastAPI processes the last-added middleware first)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins for development; restrict in production
        allow_credentials=True,
        allow_methods=["*"], 
        allow_headers=["*"], 
    )