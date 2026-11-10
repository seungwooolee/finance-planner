"""Thin Supabase account bridge. No passwords or refresh tokens are persisted."""
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from .api import body, shape
from .auth import auth_config, bearer

router = APIRouter(prefix="/api/be/v1/auth", tags=["Account sign in"])
NO_STORE = {"Cache-Control": "no-store", "Pragma": "no-cache"}


@router.get("/status")
def status():
    try:
        auth_config()
        configured = True
    except HTTPException:
        configured = False
    return JSONResponse({"configured": configured, "method": "email_password"}, headers=NO_STORE)


@router.post("/login")
def login(value=Depends(body)):
    shape(value, ["email", "password"])
    email, password = value["email"], value["password"]
    if (not isinstance(email, str) or not 3 <= len(email) <= 254 or "@" not in email
            or not isinstance(password, str) or not 1 <= len(password) <= 1024):
        raise HTTPException(422, detail={"code": "AUTH_INVALID_INPUT"}, headers=NO_STORE)
    base, key = auth_config()
    try:
        response = httpx.post(base + "/auth/v1/token", params={"grant_type": "password"},
                              json={"email": email.strip(), "password": password},
                              headers={"apikey": key}, timeout=10)
        if response.status_code in {400, 401, 403, 422}:
            raise HTTPException(401, detail={"code": "AUTH_INVALID_CREDENTIALS"}, headers=NO_STORE)
        if response.status_code == 429:
            raise HTTPException(429, detail={"code": "AUTH_RATE_LIMITED"}, headers=NO_STORE)
        response.raise_for_status()
        payload = response.json()
        token, expires = payload.get("access_token"), payload.get("expires_in")
        if (not isinstance(token, str) or not 1 <= len(token) <= 16384
                or type(expires) is not int or not 0 < expires <= 86400):
            raise ValueError("invalid login envelope")
        # Narrow the provider response: never return refresh tokens, metadata or credentials.
        return JSONResponse({"access_token": token, "expires_in": expires}, headers=NO_STORE)
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        raise HTTPException(503, detail={"code": "AUTH_UNAVAILABLE"}, headers=NO_STORE) from None


async def signup_body(request: Request):
    try:
        value = await body(request)
        shape(value, ["email", "password"])
        return value
    except HTTPException as exc:
        exc.headers = {**(exc.headers or {}), **NO_STORE}
        raise


@router.post("/signup")
def signup(value=Depends(signup_body)):
    email, password = value["email"], value["password"]
    if (not isinstance(email, str) or not 3 <= len(email.strip()) <= 254 or "@" not in email
            or not isinstance(password, str) or not 8 <= len(password) <= 1024):
        raise HTTPException(422, detail={"code": "AUTH_INVALID_INPUT"}, headers=NO_STORE)
    pending = {"status": "CHECK_EMAIL_OR_SIGN_IN"}
    try:
        base, key = auth_config()
        response = httpx.post(base + "/auth/v1/signup", timeout=10,
                              json={"email": email.strip(), "password": password},
                              headers={"apikey": key})
        if response.status_code == 429:
            raise HTTPException(429, detail={"code": "AUTH_RATE_LIMITED"}, headers=NO_STORE)
        if response.status_code in {400, 401, 403, 422}:
            error = response.json()
            code = error.get("error_code") or error.get("code")
            # Match a confirmation-pending response; never disclose account existence.
            if code in {"user_already_exists", "email_exists"}:
                return JSONResponse(pending, headers=NO_STORE)
            public_code = "AUTH_WEAK_PASSWORD" if code == "weak_password" else "AUTH_SIGNUP_REJECTED"
            raise HTTPException(422, detail={"code": public_code}, headers=NO_STORE)
        response.raise_for_status()
        payload = response.json()
        token, expires = payload.get("access_token"), payload.get("expires_in")
        if token is not None:
            if (not isinstance(token, str) or not 1 <= len(token) <= 16384
                    or type(expires) is not int or not 0 < expires <= 86400):
                raise ValueError("invalid signup session")
            return JSONResponse({"status": "SIGNED_IN", "access_token": token,
                                 "expires_in": expires}, headers=NO_STORE)
        # GoTrue returns a user object when confirmation is required, sometimes wrapped.
        user = payload.get("user", payload)
        if not isinstance(user, dict) or not isinstance(user.get("id"), str) or not user["id"]:
            raise ValueError("invalid signup envelope")
        return JSONResponse(pending, headers=NO_STORE)
    except HTTPException as exc:
        exc.headers = {**(exc.headers or {}), **NO_STORE}
        raise
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        raise HTTPException(503, detail={"code": "AUTH_UNAVAILABLE"}, headers=NO_STORE) from None


@router.post("/logout")
def logout(request: Request):
    token = bearer(request)
    base, key = auth_config()
    try:
        response = httpx.post(base + "/auth/v1/logout", params={"scope": "local"}, timeout=10,
                              headers={"apikey": key, "Authorization": "Bearer " + token})
        if response.status_code not in {401, 403}:
            response.raise_for_status()
        return JSONResponse({"signed_out": True}, headers=NO_STORE)
    except httpx.HTTPError:
        raise HTTPException(503, detail={"code": "AUTH_UNAVAILABLE"}, headers=NO_STORE) from None
