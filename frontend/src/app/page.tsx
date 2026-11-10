import { FinancialPlanner } from "@/components/financial-planner";
import Link from "next/link";

export default function Home() {
  return <><div className="bg-indigo-50 px-6 py-3 text-center text-indigo-900"><Link href="/dion" className="font-semibold underline">dion 새 질문·결과 화면 열기 →</Link><span className="ml-3 text-sm">아래는 기존 Iteration 1 검산 화면입니다.</span></div><FinancialPlanner /></>;
}
