"""National income tax scenarios for explicitly confirmed 2026 facts."""

from decimal import ROUND_CEILING, Decimal
from typing import Annotated, Literal

from pydantic import Field, field_validator

from ..explanation.contract import ExactModel

VERSION = "DION-TAX-SCENARIO-KR-2026-1.0"
YEAR = 2026
Won = Annotated[str, Field(pattern=r"^(0|[1-9][0-9]{0,14})$")]
Check = Literal["CONFIRMED", "NOT_MET", "UNKNOWN"]
Kind = Literal["PENSION", "ISA_TRANSFER", "MONTHLY_RENT"]
ITEMS = {"PENSION": "TAX-01", "ISA_TRANSFER": "TAX-03", "MONTHLY_RENT": "TAX-04"}
PENSION_CAP = Decimal("6000000")
COMBINED_CAP = Decimal("9000000")
LOW_WAGE = Decimal("55000000")
RENT_CAP = Decimal("10000000")
RENT_WAGE = Decimal("80000000")


class TaxFacts(ExactModel):
    tax_year: int = Field(ge=1900, le=2200)
    taxpayer: Check = "UNKNOWN"
    gross_salary_krw: Won | None = None
    baseline_tax_krw: Won | None = None
    prepaid_tax_krw: Won | None = None
    conditions: Check = "UNKNOWN"


class PensionFacts(TaxFacts):
    kind: Literal["PENSION"]
    pension_paid_krw: Won | None = None
    irp_paid_krw: Won | None = None
    account: Literal["PENSION", "IRP"]
    available_krw: Won | None = None


class TransferFacts(TaxFacts):
    kind: Literal["ISA_TRANSFER"]
    pension_paid_krw: Won | None = None
    irp_paid_krw: Won | None = None
    transfer_krw: Won | None = None


class RentFacts(TaxFacts):
    kind: Literal["MONTHLY_RENT"]
    rent_paid_krw: Won | None = None


ScenarioFacts = Annotated[PensionFacts | TransferFacts | RentFacts, Field(discriminator="kind")]


Hash = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]


class PreviewTax(ExactModel):
    input_hash: Hash
    facts: ScenarioFacts


class SelectTax(PreviewTax):
    run_id: str = Field(min_length=1, max_length=100)
    fingerprint: Hash
    confirmed: Literal[True]

    @field_validator("confirmed", mode="before")
    @classmethod
    def explicit_confirmation(cls, value):
        if value is not True:
            raise ValueError("explicit confirmation required")
        return value


class TaxEstimate(ExactModel):
    status: Literal["ESTIMATED", "NEEDS_INPUT", "INELIGIBLE", "OUT_OF_SCOPE", "EVIDENCE_UNAVAILABLE"]
    missing: list[str] = Field(default_factory=list)
    considered_krw: Won | None = None
    credit_base_krw: Won | None = None
    nominal_credit_krw: Won | None = None
    estimated_tax_reduction_krw: Won | None = None
    baseline_refund_krw: Won | None = None
    estimated_refund_krw: Won | None = None


def _net_effect(credit, facts):
    if facts.baseline_tax_krw is None:
        return {}
    baseline = Decimal(facts.baseline_tax_krw)
    reduction = min(baseline, credit)
    values = {"estimated_tax_reduction_krw": str(int(reduction))}
    if facts.prepaid_tax_krw is not None:
        prepaid = Decimal(facts.prepaid_tax_krw)
        values.update(baseline_refund_krw=str(int(max(0, prepaid - baseline))),
                      estimated_refund_krw=str(int(max(0, prepaid - baseline + reduction))))
    return values


def estimate(facts: ScenarioFacts) -> TaxEstimate:
    if facts.tax_year != YEAR or facts.taxpayer == "NOT_MET":
        return TaxEstimate(status="OUT_OF_SCOPE")
    if facts.conditions == "NOT_MET":
        return TaxEstimate(status="INELIGIBLE")
    required = ["gross_salary_krw"]
    if isinstance(facts, RentFacts):
        required.append("rent_paid_krw")
    else:
        required.extend(("pension_paid_krw", "irp_paid_krw"))
        required.append("available_krw" if isinstance(facts, PensionFacts) else "transfer_krw")
    missing = [key for key in required if getattr(facts, key) is None]
    missing.extend(key for key in ("taxpayer", "conditions") if getattr(facts, key) == "UNKNOWN")
    if missing:
        return TaxEstimate(status="NEEDS_INPUT", missing=missing)
    gross = Decimal(facts.gross_salary_krw)
    if isinstance(facts, RentFacts):
        rent = Decimal(facts.rent_paid_krw)
        if gross == 0 or gross > RENT_WAGE or rent == 0:
            return TaxEstimate(status="INELIGIBLE")
        base = min(rent, RENT_CAP)
        rate = Decimal(17 if gross <= LOW_WAGE else 15) / 100
        considered = rent
        credit = int(base * rate)
    else:
        if gross == 0:
            return TaxEstimate(status="INELIGIBLE")
        savings = min(Decimal(facts.pension_paid_krw), PENSION_CAP)
        previous = min(COMBINED_CAP, savings + Decimal(facts.irp_paid_krw))
        room = COMBINED_CAP - previous
        rate = Decimal(15 if gross <= LOW_WAGE else 12) / 100
        if isinstance(facts, PensionFacts):
            if facts.account == "PENSION":
                room = min(room, PENSION_CAP - savings)
            if facts.baseline_tax_krw is not None:
                usable = Decimal(facts.baseline_tax_krw)
                # Account for the current rounding remainder before the incremental credit.
                limit = int(previous * rate) + usable
                room = min(room, max(0, (limit / rate - previous).to_integral_value(rounding=ROUND_CEILING)))
            considered = base = min(Decimal(facts.available_krw), room)
        else:
            considered = Decimal(facts.transfer_krw)
            base = min(considered, room + min(Decimal("3000000"), Decimal(int(considered / 10))))
        credit = int((previous + base) * rate) - int(previous * rate)
    return TaxEstimate(status="ESTIMATED", considered_krw=str(int(considered)),
                       credit_base_krw=str(int(base)), nominal_credit_krw=str(credit),
                       **_net_effect(credit, facts))
