import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def profile():
    sample = Path(__file__).resolve().parents[2] / "data" / "sample-profile.json"
    return json.loads(sample.read_text(encoding="utf-8"))


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
