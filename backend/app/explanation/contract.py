"""The provider selects approved claims; it cannot supply money or free text."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

CONTRACT = "DION-EXPLANATION-1.0"
FACT_VERSION = "DION-EXPLANATION-FACTS-1.0"
VALIDATOR_VERSION = "DION-EXPLANATION-VALIDATOR-1.0"
PROMPT_VERSION = "DION-EXPLANATION-SELECTION-1.0"
STRATEGIES = ("STABILITY_FIRST", "INVESTMENT_CAPACITY")


class ExactModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ExplanationRequest(ExactModel):
    contract_version: Literal["DION-EXPLANATION-1.0"]
    request_key: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    expected_input_version: int = Field(ge=0)
    output_ids: list[Literal["OUT-03", "OUT-05"]] = Field(min_length=1, max_length=2)
    strategy_id: Literal["STABILITY_FIRST", "INVESTMENT_CAPACITY"] | None
    detail_level: Literal["SHORT", "DETAILED"]
    locale: Literal["ko-KR"]

    @model_validator(mode="after")
    def unique_outputs(self):
        if len(set(self.output_ids)) != len(self.output_ids):
            raise ValueError("duplicate outputs")
        if self.strategy_id and "OUT-05" not in self.output_ids:
            raise ValueError("strategy needs OUT-05")
        return self


class DraftBlock(ExactModel):
    claim_id: str = Field(min_length=1, max_length=80)
    fact_refs: list[str] = Field(max_length=16)
    relation_id: str = Field(min_length=1, max_length=80)
    wording_id: Literal["SHORT", "DETAILED"]


class ExplanationDraft(ExactModel):
    schema_version: Literal["DION-EXPLANATION-DRAFT-1.0"]
    run_ref: str = Field(min_length=1, max_length=80)
    fact_set_sha256: str = Field(min_length=64, max_length=64)
    blocks: list[DraftBlock] = Field(min_length=1, max_length=24)
    next_check_ids: list[str] = Field(max_length=30)


class ExplanationError(ValueError):
    pass
