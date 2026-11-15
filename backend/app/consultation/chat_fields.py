"""Explicit chat-to-question mappings. Values remain proposed until UI confirmation."""
import re

from .input_preview import MISSING, MONEY_RE, literal_value, review
from .policy import REGISTRY

EXTRA = {
    "NEW-01/assessment_scope": ("상담 대상", "SCOPE"),
    "LIFE-01/life_stage_primary": ("현재 생활단계", "LIFE"),
    "F03/period_month": ("소득 기준월", "MONTH"),
    "F04/period_month": ("지출 기준월", "MONTH"),
    "F06/financial_assets_total_reported_krw": ("현재 금융자산 총잔액", "MONEY"),
    "F11/goal_type": ("추가할 목표", "GOAL"),
    "F12/target_date": ("목표 날짜", "DATE"),
    "F13/target_amount_krw": ("목표 금액", "MONEY"),
}
CHOICES = {
    "SCOPE": {"나 혼자": "personal", "저 혼자": "personal", "본인": "personal", "개인": "personal"},
    "LIFE": {"사회초년": "LC_EARLY_CAREER", "신혼": "LC_NEWLYWED", "육아": "LC_CHILDCARE",
             "자녀 교육": "LC_SCHOOL_AGE", "자녀 독립": "LC_CHILD_INDEPENDENCE", "은퇴": "LC_RETIRED",
             "기타": "LC_OTHER", "모름": "LC_UNKNOWN"},
    "GOAL": {"주거": "HOUSING", "집 마련": "HOUSING", "자녀 교육": "EDUCATION",
             "은퇴": "RETIREMENT", "장기 자산 형성": "WEALTH"},
}


def labels():
    return {**{k: v["label"] for k, v in REGISTRY.items()}, **{k: v[0] for k, v in EXTRA.items()}}


def candidate(row, message):
    ref, source, value = row.field_ref, row.source_text, row.value_text
    if ref not in EXTRA:
        return review({"candidates": [row.model_dump()]}, message, {"output_id": "OUT-05"})[0][0]
    if message.count(source) != 1 or source.count(value) != 1:
        raise ValueError("ungrounded chat answer")
    label, kind = EXTRA[ref]
    if value in MISSING and kind not in CHOICES:
        state, raw, unit = MISSING[value], None, "TEXT" if kind == "MONTH" else "KRW_10000" if kind == "MONEY" else kind
    elif kind in CHOICES:
        if value not in CHOICES[kind]:
            raise ValueError("unconfirmed choice")
        state, raw, unit = "KNOWN", CHOICES[kind][value], "TEXT"
    elif kind == "MONTH":
        if not re.fullmatch(r"(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])", value):
            raise ValueError("explicit YYYY-MM required")
        state, raw, unit = "KNOWN", value, "TEXT"
    else:
        if kind == "MONEY" and value not in [m[0].strip() for m in MONEY_RE.finditer(source)]:
            raise ValueError("whole money token required")
        state, raw, unit, _ = literal_value(value, kind)
    q, f = ref.split("/")
    return {"field_ref": ref, "field": {"question_id": q, "field_id": f, "label": label},
            "state": state, "raw_value": raw, "unit": unit, "source_text": source}
