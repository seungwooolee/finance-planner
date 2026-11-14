"use client";
import {useEffect, useRef, useState} from "react";
import {REVIEW_CONTRACT, validReview, reviewReasons, type ReviewBasis, type PortfolioReview} from "@/lib/dion/portfolio-review";
import {readReviewResume} from "@/lib/dion/portfolio-review-resume";

export function usePortfolioReview(caseId: string, token: string | null, runId: string | undefined, available: boolean) {
  const [items, setItems] = useState<PortfolioReview[]>([]);
  const [review, setReview] = useState<PortfolioReview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [more, setMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = useRef<AbortController | null>(null);
  const live = useRef(false);
  const pending = useRef<{identity: string; key: string} | null>(null);
  const base = `/api/be/v1/cases/${encodeURIComponent(caseId)}/portfolio-reviews`;
  useEffect(() => {
    live.current = true;
    return () => {live.current = false; active.current?.abort(); active.current = null;};
  }, []);
  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {timedOut = true; controller.abort();}, 20_000);
    fetch(base, {cache: "no-store", headers: {Authorization: `Bearer ${token}`}, signal: controller.signal})
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 401 ? "로그인이 만료됐어요. 다시 로그인해 주세요." : "검토 상태를 불러오지 못했어요. 기존 결과는 그대로예요.");
        const value = await response.json();
        if (!Array.isArray(value.items) || !value.items.every((r: unknown) => validReview(r, caseId))) throw new Error("검토 상태 응답을 확인할 수 없어요.");
        if (controller.signal.aborted) return;
        const rows: PortfolioReview[] = value.items;
        const pointer = readReviewResume();
        let selected = rows.find(r => r.current_run_id === runId) ?? null;
        if (pointer?.reviewId && pointer.caseId === caseId && pointer.runId === runId) {
          const detail = await fetch(`${base}/${encodeURIComponent(pointer.reviewId)}`, {cache: "no-store", headers: {Authorization: `Bearer ${token}`}, signal: controller.signal});
          if (!detail.ok) throw new Error("선택한 검토 기록을 다시 열지 못했어요. 기존 결과는 유지해요.");
          const saved = await detail.json();
          if (!validReview(saved, caseId) || saved.current_run_id !== runId) throw new Error("저장한 검토 기준이 이 결과와 달라요.");
          selected = saved;
        }
        if (controller.signal.aborted) return;
        setItems(rows); setMore(rows.length === 20); setReview(selected); setLoaded(true); setError("");
      }).catch(e => {if (!controller.signal.aborted && live.current) setError(e.message);
        else if (live.current && timedOut) setError("상태 확인이 늦어졌어요. 다시 불러와 주세요.");})
      .finally(() => clearTimeout(timer));
    return () => {clearTimeout(timer); controller.abort();};
  }, [available, base, token, caseId, runId, attempt]);

  async function send(path: string, body: Record<string, unknown>): Promise<PortfolioReview | null> {
    if (!available || !loaded || active.current) return null;
    const identity = JSON.stringify([path, body]);
    if (pending.current?.identity !== identity) pending.current = {identity, key: crypto.randomUUID()};
    const controller = new AbortController(); active.current = controller;
    const timer = setTimeout(() => controller.abort(), 30_000);
    setBusy(true); setError("");
    try {
      const response = await fetch(base + path, {method: "POST", cache: "no-store", signal: controller.signal,
        headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"}, body: JSON.stringify({...body, request_key: pending.current.key})});
      const value = await response.json().catch(() => null);
      if (!response.ok) {
        const code = value?.detail?.code;
        throw new Error(response.status === 401 ? "로그인이 만료됐어요. 다시 로그인한 뒤 서버 상태를 불러와 주세요." : reviewReasons[code]
          ?? (response.status === 404 ? "이 서버에는 최종 생성 기능이 연결되지 않았어요. 기존 결과를 유지해요."
            : response.status >= 500 ? "저장·계산에 연결하지 못했어요. 작성 내용과 기존 결과는 유지해요."
              : "요청을 처리하지 못했어요. 서버 상태와 확인 내용을 다시 확인해 주세요."));
      }
      if (!validReview(value, caseId)) throw new Error("검토 상태의 버전과 응답을 확인할 수 없어 반영을 멈췄어요.");
      const targetId = path.split("/")[1];
      if (targetId && value.review_id !== targetId) throw new Error("요청한 검토와 응답의 기준이 달라 반영하지 않았어요.");
      if (body.basis && JSON.stringify(value.basis) !== JSON.stringify(body.basis)) {
        // Object key order is not part of the HTTP contract.
        const expected = body.basis as ReviewBasis;
        if (!value.basis || (Object.keys(expected) as (keyof ReviewBasis)[]).some(k => expected[k] !== value.basis![k])) throw new Error("요청한 결과·구성과 저장된 기준이 달라요.");
      }
      if (!live.current || controller.signal.aborted) return null;
      pending.current = null; setReview(value); setItems(rows => [value, ...rows.filter(r => r.review_id !== value.review_id)]);
      return value;
    } catch (e) {
      if (live.current) setError(controller.signal.aborted ? "응답이 늦어졌어요. 저장 여부를 다시 불러와 확인하거나 같은 요청을 재시도해 주세요. 작성 내용은 유지해요."
        : e instanceof Error ? e.message : "연결을 확인해 주세요. 기존 결과는 유지해요.");
      return null;
    } finally {clearTimeout(timer); if (active.current === controller) active.current = null; if (live.current) setBusy(false);}
  }
  const create = (basis: ReviewBasis) => send("", {contract_version: REVIEW_CONTRACT, basis});
  const mutate = (operation: string, value: Record<string, unknown>, target = review) => target
    ? send(`/${encodeURIComponent(target.review_id)}/${operation}`, {expected_revision: target.revision, ...value}) : Promise.resolve(null);
  async function loadMore() {
    if (!available || active.current || !items.length || !more) return;
    const controller = new AbortController(); active.current = controller; setBusy(true); setError("");
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${base}?before=${encodeURIComponent(items[items.length - 1].review_id)}`, {cache:"no-store", signal:controller.signal, headers:{Authorization:`Bearer ${token}`}});
      const value = await response.json();
      if (!response.ok || !Array.isArray(value.items) || !value.items.every((v:unknown)=>validReview(v,caseId))) throw new Error();
      if (live.current && !controller.signal.aborted) {setItems(rows=>[...rows,...value.items.filter((v:PortfolioReview)=>!rows.some(r=>r.review_id===v.review_id))]);setMore(value.items.length===20);}
    } catch {if (live.current) setError("이전 검토 기록을 더 불러오지 못했어요. 현재 결과는 유지해요.");}
    finally {clearTimeout(timer);if(active.current===controller)active.current=null;if(live.current)setBusy(false);}
  }
  return {review, items, more, loadMore, error, busy, loaded, create, mutate,
    reload: () => {if (!active.current) {setLoaded(false); setAttempt(n => n + 1);}}};
}
