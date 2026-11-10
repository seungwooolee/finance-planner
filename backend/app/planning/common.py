"""Exact amounts, source-aware missing values and deterministic validation."""

from __future__ import annotations

import calendar
import hashlib
import json
import re
from datetime import date
from decimal import Decimal, localcontext
from fractions import Fraction

from ..financial_contract import ContractError, iso_day, keys, rows_by_id

VERSION = "DION-ENGINE-1.0"
QUESTION_VERSION = "1.3-engine"
POLICY_VERSION = "DION-ALLOCATION-1.0"
STATES = {"KNOWN", "UNKNOWN", "NOT_ASKED", "NOT_APPLICABLE"}


class Missing(ContractError):
    pass


class Unsupported(ContractError):
    pass


def require(value, name):
    if value is None:
        raise Missing(name)
    return value


def flag(value, name):
    require(value, name)
    if type(value) is not bool:
        raise ContractError(name + ": boolean required")
    return value


def integer(value, name="amount"):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{1,40}", value):
        raise ContractError(name + ": nonnegative integer string required")
    return int(value)


def money(obj, path="amount"):
    """Normalize declared UI units without passing through float; unknown remains None."""
    if obj is None:
        return None
    keys(obj, ("value", "state", "unit", "basis"), ("omission_reason",))
    if obj["state"] not in STATES or obj["unit"] not in {"KRW", "KRW_10000"}:
        raise ContractError(path + ": state/unit")
    if obj["basis"] not in {"USER_REPORTED", "ACTUAL", "OFFICIAL_VALUE", "SCENARIO", "ESTIMATED"}:
        raise ContractError(path + ": basis")
    if "omission_reason" in obj:
        if obj["omission_reason"] not in {"LATER", "DECLINED"} or obj["state"] == "KNOWN":
            raise ContractError(path + ": omission reason")
    if obj["state"] != "KNOWN":
        if obj["value"] is not None:
            raise ContractError(path + ": non-known value must be null")
        return None
    raw = obj["value"]
    if not isinstance(raw, str) or not re.fullmatch(r"[0-9]{1,40}(?:\.[0-9]{1,4})?", raw):
        raise ContractError(path + ": exact nonnegative decimal string required")
    with localcontext() as ctx:
        ctx.prec = 100
        value = Decimal(raw) * (10000 if obj["unit"] == "KRW_10000" else 1)
        if value != value.to_integral_value() or value >= 10**40:
            raise ContractError(path + ": integer KRW required, maximum40 digits")
        return int(value)


def amount(value, source, basis="USER_REPORTED"):
    return {
        "value": None if value is None else str(value),
        "missing_status": "UNKNOWN" if value is None else "KNOWN",
        "basis": basis,
        "source_ref": source,
    }


def normalized_amount(obj, source):
    if obj is None:
        return {"value": None, "missing_status": "NOT_ASKED", "basis": "USER_REPORTED", "source_ref": source}
    value = money(obj)
    result = amount(value, source, obj["basis"])
    result["missing_status"] = obj["state"]
    if "omission_reason" in obj:
        result["omission_reason"] = obj["omission_reason"]
    return result


def output(state="CALCULATED", **kwargs):
    return {"calc_state": state, **kwargs}


def guarded(fn, *args):
    try:
        return fn(*args)
    except Missing as exc:
        return output("NEEDS_INPUT", missing=[str(exc)])
    except Unsupported as exc:
        return output("NOT_SUPPORTED", reason=str(exc))
    except (ContractError, KeyError, TypeError, ValueError, AttributeError) as exc:
        return output("INVALID_INPUT", reason=str(exc))


def digest(value):
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(encoded.encode()).hexdigest()


def month(value):
    return iso_day(require(value, "exact month/date required")).strftime("%Y-%m")


def months(start, end):
    first, last = iso_day(start), iso_day(end)
    n = (last.year - first.year) * 12 + last.month - first.month
    if last < first or n < 0 or n >= 600:
        raise ContractError("projection must span1..600 calendar months")
    result = []
    for i in range(n + 1):
        index = first.year * 12 + first.month - 1 + i
        result.append(f"{index // 12:04d}-{index % 12 + 1:02d}")
    return result


def month_end(period):
    y, m = map(int, period.split("-"))
    return date(y, m, calendar.monthrange(y, m)[1]).isoformat()


def prorata(total, rows):
    if total < 0 or any(integer(r["denominator"]) == 0 for r in rows):
        raise ContractError("nonnegative amount and positive denominators required")
    shares = [Fraction(integer(r["numerator"]), integer(r["denominator"])) for r in rows]
    if sum(shares) != 1:
        raise ContractError("explicit beneficiary shares must sum to1")
    values = [total * share for share in shares]
    rounded = [v.numerator // v.denominator for v in values]
    order = sorted(range(len(rows)), key=lambda i: (-(values[i] - rounded[i]), rows[i]["beneficiary_ref"]))
    for i in order[: total - sum(rounded)]:
        rounded[i] += 1
    return [{"beneficiary_ref": r["beneficiary_ref"], "amount_krw": str(v)} for r, v in zip(rows, rounded)]


def unique(rows, key):
    return rows_by_id(rows, key)
