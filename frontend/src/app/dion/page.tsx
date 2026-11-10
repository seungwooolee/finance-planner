import { DionPlanner } from "@/components/dion/planner";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "dion. · 나의 재무진단", description: "내가 확인한 정보로 현재를 살피고, 다음 계획을 준비해요." };
export default function DionPage() { return <DionPlanner />; }
