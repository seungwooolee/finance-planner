"""Server-only, opt-in OnePort configuration. No model or spend is inferred."""
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path


class ConfigurationError(ValueError):
    pass


@dataclass(frozen=True)
class OnePortConfig:
    base_url: str = "https://oneport.kr/v1"
    api_key: str = field(default="", repr=False)
    model: str = ""
    enabled: bool = False
    allow_saved_results: bool = False
    timeout: float = 15
    connect_timeout: float = 3
    max_output_tokens: int = 4096
    max_request_bytes: int = 131072
    max_response_bytes: int = 131072
    ledger_path: Path = Path("artifacts/oneport-receipts.sqlite3")
    ledger_scope: str = "UNCONFIRMED"
    # Operator attestation that ledger_path is a persistent disk shared by all workers.
    ledger_persistent: bool = False
    budget_scope: str = ""
    budget_credits: Decimal = Decimal("0")
    reserve_credits: Decimal = Decimal("0")
    max_calls: int = 1
    expires_at: str = ""

    @classmethod
    def from_env(cls):
        def env(name, default=""):
            return os.getenv("DION_ONEPORT_" + name, default).strip()

        def boolean(name):
            value = env(name, "false").lower()
            if value not in {"true", "false"}:
                raise ConfigurationError("ONEPORT_CONFIG_INVALID")
            return value == "true"

        try:
            config = cls(
                base_url=env("BASE_URL", "https://oneport.kr/v1").rstrip("/"),
                api_key=env("API_KEY"), model=env("MODEL"), enabled=boolean("ENABLED"),
                allow_saved_results=boolean("ALLOW_SAVED_RESULTS"),
                timeout=float(env("TIMEOUT_SECONDS", "15")),
                connect_timeout=float(env("CONNECT_TIMEOUT_SECONDS", "3")),
                max_output_tokens=int(env("MAX_OUTPUT_TOKENS", "4096")),
                max_request_bytes=int(env("MAX_REQUEST_BYTES", "131072")),
                max_response_bytes=int(env("MAX_RESPONSE_BYTES", "131072")),
                ledger_path=Path(env("LEDGER_PATH", "artifacts/oneport-receipts.sqlite3")),
                ledger_scope=env("LEDGER_SCOPE", "UNCONFIRMED"),
                ledger_persistent=boolean("LEDGER_PERSISTENT"),
                budget_scope=env("BUDGET_SCOPE"), budget_credits=Decimal(env("BUDGET_CREDITS", "0")),
                reserve_credits=Decimal(env("RESERVE_CREDITS", "0")),
                max_calls=int(env("MAX_CALLS", "1")), expires_at=env("EXPIRES_AT"),
            )
            config.validate()
            return config
        except (ValueError, InvalidOperation, OverflowError):
            raise ConfigurationError("ONEPORT_CONFIG_INVALID") from None

    def validate(self):
        # This adapter is verified against this gateway's contract only.
        if (self.base_url not in {"https://oneport.kr/v1", "https://schoolorder.kr/v1"} or not 0 < self.timeout <= 18
                or not 0 < self.connect_timeout <= self.timeout
                or not 1 <= self.max_output_tokens <= 8192
                or not 1024 <= self.max_request_bytes <= 262144
                or not 1024 <= self.max_response_bytes <= 262144
                or not 1 <= self.max_calls <= 100
                or not self.budget_credits.is_finite() or not self.reserve_credits.is_finite()
                or self.budget_credits < 0 or self.reserve_credits < 0
                or any(not c.isprintable() or c.isspace() or not c.isascii() for c in self.api_key)
                or len(self.model) > 160 or any(not c.isprintable() or c.isspace() or not c.isascii() for c in self.model)
                or self.model.lower() == "jev" or len(self.budget_scope) > 128
                or self.ledger_scope not in {"UNCONFIRMED", "SINGLE_HOST_DURABLE", "MULTI_HOST"}):
            raise ConfigurationError("ONEPORT_CONFIG_INVALID")

    def readiness(self, *, synthetic=False, data_allowed=None):
        self.validate()
        if not self.enabled:
            return "ONEPORT_DISABLED"
        if not self.api_key or not self.model:
            return "ONEPORT_NOT_CONFIGURED"
        if self.ledger_scope != "SINGLE_HOST_DURABLE":
            return "ONEPORT_SHARED_LEDGER_REQUIRED" if self.ledger_scope == "MULTI_HOST" else "ONEPORT_DURABILITY_UNCONFIRMED"
        if not self.ledger_path.is_absolute():
            return "ONEPORT_ABSOLUTE_LEDGER_PATH_REQUIRED"
        if data_allowed is None:
            data_allowed = self.allow_saved_results
        if not synthetic and not data_allowed:
            return "ONEPORT_SYNTHETIC_ONLY"
        if (not self.budget_scope or self.budget_credits <= 0 or self.reserve_credits <= 0
                or self.reserve_credits > self.budget_credits):
            return "ONEPORT_BUDGET_NOT_CONFIGURED"
        # A lost ledger would reset spend/idempotency records, so fail closed until confirmed.
        if not self.ledger_persistent:
            return "ONEPORT_LEDGER_NOT_CONFIRMED"
        try:
            end = datetime.fromisoformat(self.expires_at)
            now = datetime.now(timezone.utc)
            korea = timezone(timedelta(hours=9))
            # Prevent a gateway daily cap reset from silently renewing this approval.
            if end.tzinfo is None or not now < end or end.astimezone(korea).date() != now.astimezone(korea).date():
                return "ONEPORT_BUDGET_EXPIRED"
        except ValueError:
            return "ONEPORT_BUDGET_EXPIRED"
        return None
