"""Build the versioned public retirement illustration from the contest draft's assumptions."""

import argparse
import json
from decimal import Decimal, ROUND_HALF_UP, localcontext
from pathlib import Path

OUT = Path(__file__).resolve().parents[3] / "frontend/src/lib/dion/retirement-report.json"
ASSETS = (
    ("ACE 미국하이일드액티브(H)", 20_000_000, 695, 350, 350),
    ("KODEX 미국10년국채액티브(H)", 180_000_000, 417, 678, 0),
    ("국고채 5년물 직접 보유", 200_000_000, 350, None, 0),
    ("KODEX KOFR금리액티브(합성)", 40_000_000, 269, 0, 0),
    ("KODEX CD금리액티브(합성)", 30_000_000, 285, 0, 0),
    ("KODEX 머니마켓액티브", 30_000_000, 141, 9, 0),
)
SHOCKS = (("S1", 50, 0), ("S2", 100, 100), ("S3", 200, 300))
DEBT = 100_000_000
DEBT_INTEREST = 6_000_000
RESERVE = 10_000_000
BPS = Decimal(10_000)


def won(value):
    return str(Decimal(value).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def income(principal, rate_bps):
    return principal * Decimal(rate_bps) / BPS


def bond_loss(rate):
    # 5 years, par purchase, 3.5% coupon and initial YTM, semiannual payments.
    half_coupon = Decimal("0.035") / 2
    discount = 1 + half_coupon + rate / 2
    return 1 - sum(half_coupon / discount**period for period in range(1, 11)) - 1 / discount**10


def shock_loss(principals, rate_bps, spread_bps):
    rate, spread = Decimal(rate_bps) / BPS, Decimal(spread_bps) / BPS
    return sum(
        principal * (bond_loss(rate) if duration is None else (duration * rate + credit * spread) / 100)
        for principal, (_, _, _, duration, credit) in zip(principals, ASSETS, strict=True)
    )


def build():
    starting = sum(asset[1] for asset in ASSETS)
    pre_reserve = sum(income(principal, rate) for _, principal, rate, _, _ in ASSETS)
    with localcontext() as context:
        context.prec = 50
        # Confirm the draft's original, rounded percentages before revaluing the two alternatives.
        assert [
            (shock_loss([asset[1] for asset in ASSETS], rate, spread) * 100 / starting).quantize(Decimal("0.01"))
            for _, rate, spread in SHOCKS
        ] == [Decimal("2.19"), Decimal("4.50"), Decimal("9.05")]
        plans = []
        for repay in (False, True):
            repayments = [0, 0, DEBT if repay else 0, 0, 0, 0]
            reserves = [0, 0, 0, 0, 0, RESERVE]
            principals = [a[1] - r - e for a, r, e in zip(ASSETS, repayments, reserves, strict=True)]
            annual_income = [income(p, a[2]) for p, a in zip(principals, ASSETS, strict=True)]
            gross = sum(annual_income)
            interest = 0 if repay else DEBT_INTEREST
            remaining = starting - sum(repayments)
            assert remaining == sum(principals) + RESERVE
            plans.append({
                "id": "REPAY" if repay else "KEEP",
                "financialAssetsKrw": won(remaining),
                "debtKrw": won(DEBT - sum(repayments)),
                "reserveKrw": won(RESERVE),
                "proposedKrw": won(sum(principals)),
                "grossAnnualKrw": won(gross),
                "debtInterestAnnualKrw": won(interest),
                "afterInterestAnnualKrw": won(gross - interest),
                "positions": [
                    {"label": a[0], "currentKrw": won(a[1]), "reserveKrw": won(e), "repayKrw": won(r),
                     "proposedKrw": won(p), "rateBps": a[2], "annualKrw": won(y)}
                    for a, e, r, p, y in zip(ASSETS, reserves, repayments, principals, annual_income, strict=True)
                ],
                "shocks": [
                    {"id": name, "rateBps": rate, "spreadBps": spread,
                     "lossKrw": won(loss), "lossBps": int(won(loss * BPS / remaining))}
                    for name, rate, spread in SHOCKS
                    for loss in [shock_loss(principals, rate, spread)]
                ],
            })
    assert [p["afterInterestAnnualKrw"] for p in plans] == ["12109000", "14609000"]
    return {"version": "DION-RETIREMENT-REPORT-1.0", "preReserveAnnualKrw": won(pre_reserve),
            "deltaAnnualKrw": won(int(plans[1]["afterInterestAnnualKrw"]) - int(plans[0]["afterInterestAnnualKrw"])),
            "plans": plans}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    data = json.dumps(build(), ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUT.write_text(data, encoding="utf-8", newline="\n")
    elif OUT.read_text(encoding="utf-8") != data:
        raise SystemExit(f"{OUT.name} differs from the versioned scenario assumptions")
    else:
        print("Retirement report amounts and stress scenarios match the versioned snapshot.")
