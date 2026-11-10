"""Bridge explicit customer reserve modes into frozen DION-ALLOCATION-1.0 inputs."""

from __future__ import annotations

from .common import ContractError, Missing, money, require


def resolve_reserve_targets(raw, essential, required_debt, period, source_ref):
    """Targets are recalculated against each month's declared required debt cashflow.

    3B/B is the existing approved service policy, not a legal or suitability rule.
    The frozen allocator still applies its own minimum and conservation checks.
    """
    mode = raw.get("customer_target_mode", "TOTAL_TARGET")
    if mode not in {"POLICY_ONLY", "TOTAL_TARGET", "EXTRA_ABOVE_MINIMUM", "UNKNOWN"}:
        raise ContractError("unknown customer reserve target mode")
    if mode == "UNKNOWN":
        raise Missing("customer reserve target unknown; allocation policy is decided")
    base = essential + required_debt
    minima = {"protection": 3 * base, "operating": base}
    customer, extras = {}, {}
    for kind in minima:
        if mode == "POLICY_ONLY":
            customer[kind], extras[kind] = 0, 0
        elif mode == "EXTRA_ABOVE_MINIMUM":
            extras[kind] = require(
                money(raw.get("customer_" + kind + "_extra")), "confirmed customer " + kind + " extra"
            )
            customer[kind] = minima[kind] + extras[kind]
        else:
            customer[kind] = require(
                money(raw.get("customer_" + kind + "_target")), "confirmed customer " + kind + " total target"
            )
            extras[kind] = None
    return {
        "version": "DION-RESERVE-TARGETS-1.0",
        "policy_version": "DION-ALLOCATION-1.0",
        "period": period,
        "source_ref": source_ref,
        "mode": mode,
        "essential_living_krw": str(essential),
        "required_debt_payment_krw": str(required_debt),
        "policy_minimum_krw": {k: str(v) for k, v in minima.items()},
        "confirmed_extra_krw": {k: None if v is None else str(v) for k, v in extras.items()},
        "customer_total_krw": {k: str(v) for k, v in customer.items()},
        "effective_target_krw": {k: str(max(minima[k], customer[k])) for k in minima},
    }
