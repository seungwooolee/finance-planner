import type { Metadata } from "next";
import { LoginScreen } from "@/components/login-screen";

export const metadata: Metadata = {
  title: "LifePath AI · 로그인",
  description: "LifePath와 함께 나에게 맞는 미래를 그려보세요.",
};

export default function LoginPage() {
  return <LoginScreen />;
}
