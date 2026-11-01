import type { Metadata } from "next";
import { NotFoundScreen } from "@/components/not-found-screen";

export const metadata: Metadata = {
  title: "LifePath AI · 길을 찾지 못했어요",
  description: "길을 잃은 고양이와 함께 LifePath로 돌아가요.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <NotFoundScreen />;
}
