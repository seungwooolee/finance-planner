"""LifePath AI HTTP boundary: validate requests, then run the Decimal engine."""

import json
from decimal import Decimal
from math import isfinite
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from .engine import calculate_plan
from .models import CalculationResponse, Profile


class DecimalRequest(Request):
    async def json(self):
        if not hasattr(self, "_json"):
            # The default float parser can round fractional won to an integer
            # before validation. Preserve the exact numeric JSON token instead.
            self._json = json.loads(await self.body(), parse_float=Decimal, parse_constant=Decimal)
        return self._json


class DecimalRoute(APIRoute):
    def get_route_handler(self):
        original_handler = super().get_route_handler()

        async def decimal_handler(request: Request):
            return await original_handler(DecimalRequest(request.scope, request.receive))

        return decimal_handler


app = FastAPI(title="LifePath AI", version="0.1.0")
app.router.route_class = DecimalRoute
SAMPLE_PROFILE_PATH = Path(__file__).resolve().parents[2] / "data" / "sample-profile.json"


def json_safe_errors(value):
    """Keep malformed NaN/Infinity input from breaking the validation response."""
    if isinstance(value, float) and not isfinite(value):
        return str(value)
    if isinstance(value, dict):
        return {key: json_safe_errors(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe_errors(item) for item in value]
    return value


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, error: RequestValidationError):
    errors = jsonable_encoder(error.errors(), custom_encoder={Decimal: str})
    return JSONResponse(status_code=422, content={"detail": json_safe_errors(errors)})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/sample-profile", response_model=Profile)
def sample_profile() -> Profile:
    return Profile.model_validate_json(SAMPLE_PROFILE_PATH.read_text(encoding="utf-8"))


@app.post("/api/calculate", response_model=CalculationResponse)
def calculate(profile: Profile) -> CalculationResponse:
    return CalculationResponse(input=profile, **calculate_plan(profile.engine_inputs()))
