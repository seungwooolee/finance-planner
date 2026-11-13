"use client";

import { Json } from "@/lib/dion/model";
import { productEmptyCause } from "@/lib/dion/product-empty";

export function InvestmentFollowup({ review, onEdit }: { review: Record<string, Json>; onEdit: (id: string) => void }) {
  if (!productEmptyCause(review, "")?.investment) return null;
  return <div className="d-warning"><p>투자 검토에 필요한 답변이 아직 확인되지 않았어요. 이미 답한 내용은 유지하고 필요한 질문만 열어요.</p><button className="d-secondary" onClick={() => onEdit("F17")}>투자 성향 질문 답하고 대표상품 보기</button><p className="d-help">답변을 마친 뒤 재계산하면 확인한 조건으로 검토해요. 안정 선호나 상품·정책 조건에 따라 미배분으로 남을 수 있어요.</p></div>;
}
