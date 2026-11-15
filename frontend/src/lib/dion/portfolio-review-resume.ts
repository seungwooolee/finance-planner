// Only opaque references. Answers, generated portfolios and authentication stay on their existing paths.
export type ReviewResume = {caseId: string; runId: string; reviewId?: string};
const key = "dion.portfolio-review.resume.v1";
export function readReviewResume(): ReviewResume | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (typeof v?.caseId === "string" && typeof v.runId === "string" && v.caseId.length <= 100 && v.runId.length <= 100
      && (v.reviewId === undefined || typeof v.reviewId === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v.reviewId))) return v;
  } catch { /* Storage disabled or malformed. */ }
  return null;
}
export function rememberReviewResume(value: ReviewResume) {
  try {sessionStorage.setItem(key, JSON.stringify(value));} catch { /* Server remains authoritative. */ }
}
