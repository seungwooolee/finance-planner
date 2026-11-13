"use client";

import { useState } from "react";
import { object } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";
import { resultHints } from "@/lib/dion/result-guidance";
import { checkStorageKey, monthlyChecklist, readChecked, writeChecked } from "@/lib/dion/beta-step6";
import { PlanSelector, planName } from "./plan-comparison";
import type { ViewResult } from "./results";

// Steps 4–6 beta: client-only check state (memory + localStorage). No server save, no plan adoption.
export function MonthlyCheck({ view, caseKey, onBack, onEdit }: { view: ViewResult; caseKey: string; onBack: () => void; onEdit: (id: string) => void }) {
  const [plan, setPlan] = useState("STABILITY_FIRST");
  const list = monthlyChecklist(view.result, plan);
  const key = checkStorageKey(caseKey, plan, list.period);
  const [store, setStore] = useState<Record<string, string[]>>({});
  const checked = store[key] ?? readChecked(key);
  const toggle = (id: string) => {
    const next = checked.includes(id) ? checked.filter(v => v !== id) : [...checked, id];
    setStore(s => ({ ...s, [key]: next }));
    writeChecked(key, next);
  };
  const hints = resultHints(view.result, null).slice(0, 3);
  return <section className="d-results" aria-label="이번 달 실행 체크">
    <div className="d-result-heading"><div><span className="d-eyebrow">STEP 4–6 · BETA</span><h1>이번 달 실행 체크</h1><p>{String(object(view.result.context).evaluation_on ?? "기준일 확인 필요")} 기준 결과에서 가져온 할 일이에요.</p></div><button className="d-secondary" onClick={onBack}>결과로 돌아가기</button></div>
    <div className="d-warning" role="note"><strong>베타: 체크 내용은 서버에 저장되지 않아요</strong><p>이 기기의 브라우저에만 임시로 남아요. 체크는 실제 거래·계획 채택을 뜻하지 않아요.</p></div>
    <article className="d-card"><h2>4. 계획 선택 (이 기기에서만)</h2><PlanSelector selected={plan} onSelect={setPlan} /></article>
    <article className="d-card"><h2>5. {planName(plan)} · {list.period || "기간 확인 필요"} 할 일</h2>
      {list.items.length ? <ul className="d-actions">{list.items.map(item => <li key={item.id}><label><input type="checkbox" checked={checked.includes(item.id)} onChange={() => toggle(item.id)} /> {item.label}{item.amountKrw && <> · {formatKrw(item.amountKrw)}</>}</label></li>)}</ul>
        : <><p>이 계획에서 이번 달 금액이 계산된 할 일이 아직 없어요.</p>{hints.length > 0 && <ol className="d-actions">{hints.map(h => <li key={h.id}><button onClick={() => onEdit(h.id)}>{h.text}</button></li>)}</ol>}</>}
      {list.items.length > 0 && <p className="d-help">완료 {list.items.filter(i => checked.includes(i.id)).length} / {list.items.length}</p>}
    </article>
    <article className="d-card"><h2>6. 점검</h2><p>다음 달 다시 진단해 보세요. 소득·지출·자산이 바뀌었다면 답변을 수정한 뒤 새로 계산하면 돼요.</p></article>
  </section>;
}
