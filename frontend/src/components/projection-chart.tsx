"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CalculationResult } from "@/lib/profile";
import { formatMoney } from "@/lib/profile";

export function ProjectionChart({ result }: { result: CalculationResult }) {
  // Number conversion is exclusively for chart coordinates. All financial values come from the API.
  const chartData = result.monthly.map((row) => ({
    month: row.month,
    housingSavings: Number(row.housing_savings),
    goalFunds: Number(row.goal_funds),
  }));
  return (
    <div
      className="h-72 w-full min-w-0 sm:h-80"
      aria-label={`0개월부터 ${result.input.goal.horizon_months}개월까지의 주거 저축과 목표재원 그래프. 정확한 값은 아래 월별 표에서 확인할 수 있습니다.`}
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart
          data={chartData}
          margin={{ top: 24, right: 14, bottom: 4, left: 8 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0a9a88" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#0a9a88" stopOpacity={0.015} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="#e9eef4"
            vertical={false}
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            tickFormatter={(value: number) => `${value}개월`}
            dy={10}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={72}
            tickFormatter={(value: number) =>
              `${(value / 10000).toLocaleString("ko-KR")}만`
            }
            domain={[0, "auto"]}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e1e8ef",
              fontSize: 12,
              boxShadow: "0 8px 30px #17283c10",
            }}
            labelFormatter={(value) => `${value}개월`}
            formatter={(value, name) => [formatMoney(String(value)), name]}
          />
          <ReferenceLine
            y={Number(result.summary.target_amount)}
            stroke="#8f9bae"
            strokeDasharray="5 5"
            ifOverflow="extendDomain"
            label={{
              value: "목표 금액",
              position: "insideTopLeft",
              fill: "#7d8a9c",
              fontSize: 11,
            }}
          />
          <Area
            type="linear"
            dataKey="housingSavings"
            name="주거 목적 저축"
            stroke="#0a9482"
            strokeWidth={2.5}
            fill="url(#savingsGradient)"
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="goalFunds"
            name={
              result.input.assumptions.deposit_returned_at_goal
                ? "목표재원 (반환 보증금 포함)"
                : "목표재원 (보증금 반환 제외)"
            }
            stroke="#224b70"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
