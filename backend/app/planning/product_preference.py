"""Explicit product choices captured in the existing analysis confirmations."""

import re

from .common import ContractError

IDENTITY = "PRODUCT-SELECTION"
VERSION = "DION-PRODUCT-SELECTION-1.0"


def product_preference(document):
    row = next((c for c in document.get("confirmations", []) if c.get("question_id") == IDENTITY), None)
    if row is None:
        return None
    values = row.get("values")
    if (row.get("definition_version") != VERSION or not row.get("source_ref")
            or not isinstance(values, dict) or set(values) != {"strategy_id", "portfolio_type", "codes"}
            or values["strategy_id"] not in ("STABILITY_FIRST", "INVESTMENT_CAPACITY")
            or values["portfolio_type"] not in ("STABLE", "BALANCED", "RETURN")):
        raise ContractError("invalid product selection confirmation")
    codes = values["codes"]
    if (not isinstance(codes, list) or not 1 <= len(codes) <= 3
            or any(not isinstance(code, str) or not re.fullmatch(r"[0-9A-Z]{6}", code) for code in codes)
            or len(set(codes)) != len(codes)):
        raise ContractError("invalid selected products")
    return values
