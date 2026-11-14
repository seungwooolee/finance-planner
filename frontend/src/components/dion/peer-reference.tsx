"use client";

import { useId, useState } from "react";
import { Json, list, object, textValue } from "@/lib/dion/model";
import { formatKrw } from "@/lib/dion/money-format";

function Source({ row }: { row: Record<string, Json> }) {
  const url = textValue(row.source_url);
  return <p>{textValue(row.publisher)} · {url.startsWith("https://") ? <a href={url} target="_blank" rel="noopener noreferrer">{textValue(row.source_title)} ↗</a> : textValue(row.source_title)}</p>;
}

export function PeerReference({ value, stale, preference = false }: { value: Json | undefined; stale: boolean; preference?: boolean }) {
  const data = object(value), all = list(data.records), id = useId();
  const [selected, setSelected] = useState("");
  const hints = list(data.stage_hints);
  const preferred = hints.flatMap(h => Array.isArray(h.cohort_ids) ? h.cohort_ids.filter((v): v is string => typeof v === "string") : []);
  const rows = all.filter(r => preference ? ["C15", "C19"].includes(textValue(r.cohort_id)) : !["C15", "C19"].includes(textValue(r.cohort_id)));
  const groups = [...new Map(rows.map(r => [textValue(r.cohort_id), textValue(r.cohort_label)])).entries()]
    .sort((a, b) => Number(preferred.includes(b[0])) - Number(preferred.includes(a[0])));
  const current = rows.filter(r => r.cohort_id === selected);
  const title = preference ? "투자선호 조사와의 비교" : "생활단계 참고 통계";

  return <section className="d-card" aria-labelledby={id} data-peer-reference={preference ? "preference" : "finance"}>
    <span className="d-eyebrow">{preference ? "INVESTMENT PREFERENCE" : "LIFE STAGE REFERENCE"}</span>
    <h2 id={id}>{title}</h2>
    {!data.version ? <p>이 결과에는 참고 통계가 저장되어 있지 않아요. 다시 계산하면 현재 자료를 함께 확인할 수 있어요.</p> : <>
      {stale && <p className="d-warning" role="status">이전 입력 기준의 참고 통계예요. 현재 수정 중인 답변과 섞지 않았어요.</p>}
      {preference ? <>
        <p>{textValue(data.preference_reason)}</p>
        <p>외부 분포를 나의 위험등급이나 권장 투자비중으로 바꾸지 않아요.</p>
        <details><summary>확인 중인 조사와 보류 이유</summary>{[...new Map(rows.map(r => [textValue(r.source_id), r])).values()].map(r => <div key={textValue(r.id)}><Source row={r}/><p>{textValue(r.reason)}</p><p>{textValue(r.cohort_definition)}</p></div>)}</details>
      </> : <>
        <p>조사에서 확인한 집단의 평균·중앙값을 살펴보세요. 생활단계 이름이 비슷해도 같은 집단이라는 뜻은 아니에요.</p>
        {hints.length ? <ul>{hints.map(h => <li key={textValue(h.code)}><strong>{textValue(h.label)}</strong> · {textValue(h.reason)}</li>)}</ul> : <p>확인된 생활단계가 없어 전체 조사 집단을 보여드려요.</p>}
        <label htmlFor={`${id}-cohort`}>살펴볼 조사 집단</label>
        <select id={`${id}-cohort`} value={selected} onChange={e => setSelected(e.target.value)} style={{ display: "block", width: "100%", maxWidth: "100%", margin: "12px 0", padding: 12 }}>
          <option value="">집단의 범위를 확인하고 선택해주세요</option>
          {groups.map(([key, label]) => <option key={key} value={key}>{label}{rows.some(r => r.cohort_id === key && r.review_status === "REFERENCE_ONLY") ? "" : " · 수치 보류"}</option>)}
        </select>
        <p className="d-note">내 결과 기준일 {textValue(data.evaluation_on)} · {data.scope === "household" ? "가구" : data.scope === "personal" ? "개인" : "범위 확인 필요"} · 통계는 각 항목에 적힌 과거 기준이에요. 차이·순위·적정 수준은 산출하지 않아요.</p>
        {current.length > 0 && <div aria-live="polite"><p><strong>{textValue(current[0].cohort_label)}</strong><br/>{textValue(current[0].cohort_definition)}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: 16 }}>
            {current.map(row => <article className="d-metric" key={textValue(row.id)} data-statistic-id={textValue(row.statistic_id)}>
              <h3>{textValue(row.label)}</h3>
              <span>{textValue(row.statistic_type)} · {textValue(row.target_unit)}</span>
              <strong>{row.review_status !== "REFERENCE_ONLY" ? "수치 표시 보류" : row.unit === "%" ? `${textValue(row.value)}%` : formatKrw(row.value)}</strong>
              <p>통계 기준: {textValue(row.period_start) || "확인 필요"}{row.period_end !== row.period_start && row.period_end ? ` ~ ${textValue(row.period_end)}` : ""}</p>
              {row.user_value !== null && row.user_value !== undefined && <p>내 결과 · DION 기준 <b>{formatKrw(row.user_value)}</b></p>}
              <p>{textValue(row.user_value_reason)}</p>
              <details><summary>출처·정의·비교 한계</summary><Source row={row}/>
                <p>공표일: {textValue(row.published_on) || "확인 필요"}</p>
                <p>{textValue(row.definition)}</p><p>{textValue(row.limitations)}</p>
                <p>{textValue(row.quality)}</p>
                {row.review_status === "REFERENCE_ONLY" && <><p>원문 위치: {textValue(row.source_position)}</p><p>원문 {textValue(row.source_value)} {textValue(row.source_unit)} · 공공누리 출처표시</p></>}
              </details>
            </article>)}
          </div>
        </div>}
      </>}
      <details style={{ marginTop: 16 }}><summary>이 결과에 사용한 자료 버전</summary><p>{textValue(data.data_version)} · {textValue(data.version)}</p><p>결과의 입력 버전 {typeof data.input_version === "number" ? data.input_version : textValue(data.input_version)}에 연결된 자료예요. 새 자료가 나와도 이 저장 결과의 통계를 자동 교체하지 않아요.</p></details>
    </>}
  </section>;
}
