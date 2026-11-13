import { feedbackLink } from "../lib/dion/beta-config";

export function BetaNotice() {
  const feedback = feedbackLink(process.env.NEXT_PUBLIC_FEEDBACK_URL);
  return <aside className="beta-notice" aria-label="베타 안내">가상 데이터만 입력해 주세요{feedback && <> · 피드백: <a href={feedback} target="_blank" rel="noopener noreferrer">{feedback}</a></>}</aside>;
}
