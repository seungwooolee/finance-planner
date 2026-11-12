import type { ReactNode } from "react";

export function EvidenceDisclosure({children}: {children: ReactNode}) {
  return <details className="d-explanation-evidence">
    <summary>근거 보기</summary>
    {children}
  </details>;
}
