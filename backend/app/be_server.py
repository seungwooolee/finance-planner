"""Explicit integration entry point, preserving the user's existing main.py."""
from pathlib import Path

from dotenv import load_dotenv

from .be.api import router
from .be.auth_api import router as auth_router
from .be.question_api import router as question_router
from .main import app

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
app.include_router(router)
app.include_router(question_router)
app.include_router(auth_router)
