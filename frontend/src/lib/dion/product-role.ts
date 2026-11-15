import { type Json, object, textValue } from "./model";
import { assetGroup } from "./result-visual";

type Row = Record<string, Json>;

export const RISK_LABEL: Record<number, string> = { 1: "매우 높은 위험", 2: "높은 위험", 3: "다소 높은 위험", 4: "보통 위험", 5: "낮은 위험", 6: "매우 낮은 위험" };
const ROLE_TEXT: Record<string, string> = {
  BOND: "채권에 투자해요. 주식보다 가격 변동이 작은 편이라 구성의 바닥을 받쳐줘요.",
  KR_EQUITY: "국내 주식에 투자해요. 오래 두면 성장을 기대할 수 있지만 가격이 크게 오르내릴 수 있어요.",
  GLOBAL_EQUITY: "해외 주식에 투자해요. 성장을 기대할 수 있지만 가격과 환율이 함께 오르내려요.",
  OTHER: "채권·주식 외 금융상품이에요. 투자 대상과 원금손실 가능성은 상품 자료에서 확인해 주세요.",
};

/** Plain-language product line from the server disclosure only (asset class, benchmark, FX). */
export function productRole(product: Row | undefined): string {
  const d = object(product?.disclosure);
  const group = assetGroup(product);
  const benchmark = textValue(d.benchmark);
  return `${benchmark ? `기준지수 ${benchmark}를 따라가요. ` : ""}${ROLE_TEXT[group.id] ?? ROLE_TEXT.OTHER}`;
}

