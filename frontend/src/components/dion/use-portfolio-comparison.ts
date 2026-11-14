"use client";
import { useEffect, useRef, useState } from 'react';
import { object, textValue } from '@/lib/dion/model';
import type { ComparisonResponse } from '@/lib/dion/portfolio-comparison';
import type { ViewResult } from './results';

export function usePortfolioComparison(view: ViewResult, token: string | null, caseId: string, stale: boolean, initial?: {strategy_id: string; portfolio_type: string | null}) {
  const [plan, setPlan] = useState(initial?.strategy_id ?? 'STABILITY_FIRST');
  const [portfolio, setPortfolio] = useState<string | null>(initial?.portfolio_type ?? null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const review = object(object(view.result.results)['OUT-06']);
  const saved = !!token && view.storage === 'SAVED' && !!view.runId && caseId === textValue(object(object(view.source).context).case_id);
  const endpoint = `/api/be/v1/cases/${encodeURIComponent(caseId)}/analyses/${encodeURIComponent(view.runId ?? '')}/portfolio-comparison`;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  // Results is keyed by run/input/account. Abort and ignore old responses after that boundary changes.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (!saved) return;
    const controller = new AbortController();
    fetch(endpoint, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error('LOAD'); return r.json() as Promise<ComparisonResponse>; })
      .then(value => {
        if (controller.signal.aborted) return;
        setRevision(value.revision);
        if (value.selection && value.selection.run_id === view.runId && value.selection.case_id === caseId) {
          setPlan(value.selection.strategy_id); setPortfolio(value.selection.portfolio_type);
          setStatus(value.is_current ? '저장한 비교 초안을 불러왔어요.' : '이전 입력의 비교 초안이에요. 다시 계산해주세요.');
        }
        setLoaded(true);
      }).catch(() => { if (!controller.signal.aborted) setError('비교 초안을 불러오지 못했어요. 다시 불러온 뒤 선택해주세요.'); });
    return () => controller.abort();
  }, [saved, endpoint, token, view.runId, caseId, reload]);

  const choose = async (type: string) => {
    if (stale || busy || inFlight.current || (saved && !loaded)) return false;
    if (!saved) { setPortfolio(type); setStatus('이 화면의 비교 초안이에요. 로그인 후 계산 결과를 저장하면 구성도 저장할 수 있어요.'); return true; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      const r = await fetch(endpoint, { method: 'PUT', cache: 'no-store', headers, signal: AbortSignal.timeout(20000), body: JSON.stringify({
        expected_revision: revision, request_key: `portfolio-${crypto.randomUUID()}`, strategy_id: plan, portfolio_type: type,
        input_version: view.serverVersion, input_hash: view.inputHash,
        policy_version: review.product_policy && object(review.product_policy).version,
        types_version: object(review.portfolio_types).version, catalog_version: object(review.catalog).version,
      }) });
      if (!r.ok) throw new Error('SAVE');
      const value = await r.json() as ComparisonResponse;
      if (!alive.current) return false;
      setRevision(value.revision); setPortfolio(type); setStatus('비교 초안을 저장했어요. 계획 채택과 이번 달 기록은 그대로예요.');
      return true;
    } catch {
      if (alive.current) setError('비교 초안을 저장하지 못했어요. 현재 입력·결과를 다시 불러온 뒤 선택해주세요.');
      return false;
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  };
  return { plan, portfolio, revision, choose, busy, error, status, retry: () => { setError(''); setLoaded(false); setReload(n=>n+1); }, blocked: stale || busy || (saved && !loaded),
    selectPlan: (id: string) => { if (!inFlight.current) { setPlan(id); setPortfolio(null); setStatus('재무안을 비교 중이에요. 투자구성을 선택하면 비교 초안을 저장해요.'); } } };
}
