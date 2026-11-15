"""Explicit integration entry point, preserving the user's existing main.py."""
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

from .be.api import router
from .be.auth_api import router as auth_router
from .be.consultation_api import router as consultation_router
from .be.deployment import router as deployment_router
from .be.explanation_api import router as explanation_router
from .be.plan_api import router as plan_router
from .be.question_api import router as question_router
from .be.readiness import router as readiness_router
from .be.readiness import startup_check
from .be.survey_api import router as survey_router
from .main import app

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

previous_lifespan = app.router.lifespan_context


@asynccontextmanager
async def lifespan(application):
    startup_check()
    async with previous_lifespan(application) as state:
        yield state


app.router.lifespan_context = lifespan
app.include_router(readiness_router)
app.include_router(deployment_router)
app.include_router(router)
app.include_router(question_router)
app.include_router(auth_router)
app.include_router(explanation_router)
app.include_router(consultation_router)
app.include_router(plan_router)
app.include_router(survey_router)
