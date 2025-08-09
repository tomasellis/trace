import os
import logging
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from chromadb.config import Settings
import os
from datetime import datetime
from threading import Lock
from fastapi.responses import JSONResponse
from dotenv import load_dotenv


import sys
import traceback

# load .env from the project root (one directory up from embeddings-service)
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

from contextlib import asynccontextmanager


def excepthook(exc_type, exc_value, exc_traceback):
    print("UNCAUGHT EXCEPTION:", file=sys.stderr)
    traceback.print_exception(exc_type, exc_value, exc_traceback, file=sys.stderr)

sys.excepthook = excepthook

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info("[LOG] main.py module imported (process startup)")

def chroma_env_vars():
    """
    Checks if CHROMA_DB_URL is set and not empty.
    Raises a RuntimeError if not.
    """
    chroma_db_host = os.getenv("CHROMA_DB_HOST")
    chroma_db_port = os.getenv("CHROMA_DB_PORT")

    print("CHROMA DB is on:")
    print(chroma_db_host)
    print("CHROMA PORT is on:")
    print(chroma_db_port)
    return chroma_db_host, chroma_db_port

app = FastAPI(
    title="Movie Video Archive - Embeddings Service",
    description="Microservice for generating image embeddings using OpenCLIP for movies",
    version="1.0.0",
)

logger.info("[LOG] FastAPI app instance created")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
    }