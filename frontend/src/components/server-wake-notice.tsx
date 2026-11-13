"use client";

export function ServerWakeNotice({ waiting, exhausted, onRetry }: { waiting: boolean; exhausted: boolean; onRetry: () => void }) {
  if (waiting) return <div className="server-wake-notice" role="status">서버 준비 중이에요(최대 1분). 잠시만 기다려 주세요</div>;
  if (exhausted) return <div className="server-wake-notice" role="alert">서버에 연결하지 못했어요. 작성값은 그대로예요. <button type="button" onClick={onRetry}>다시 시도</button></div>;
  return null;
}
