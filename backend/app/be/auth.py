"""Verify the bearer token with Supabase Auth; never trust a body/header actor ID."""
import os
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, Request


def auth_config():
    base = os.getenv("DION_SUPABASE_URL", "").rstrip("/")
    key = os.getenv("DION_SUPABASE_PUBLIC_KEY", "")
    parsed = urlparse(base)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.path or parsed.query or parsed.fragment or not key):
        raise HTTPException(503, detail={"code": "AUTH_CONFIG_MISSING"})
    return base, key


def bearer(request: Request):
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token or len(token) > 16384:
        raise HTTPException(401, detail={"code": "AUTH_REQUIRED"})
    return token


def get_actor(request: Request) -> str:
    token = bearer(request)
    base, key = auth_config()
    try:
        response = httpx.get(base + "/auth/v1/user", timeout=10,
                             headers={"apikey": key, "Authorization": "Bearer " + token})
        if response.status_code in {401, 403}:
            raise HTTPException(401, detail={"code": "AUTH_INVALID"})
        response.raise_for_status()
        user = response.json()
        if not isinstance(user.get("id"), str) or not user["id"]:
            raise ValueError("invalid user envelope")
        return user["id"]
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        raise HTTPException(503, detail={"code": "AUTH_UNAVAILABLE"}) from None
