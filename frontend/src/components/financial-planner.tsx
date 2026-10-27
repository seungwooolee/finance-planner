"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Compass,
  Flag,
  House,
  Info,
  Landmark,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fieldLabels,
  formatMoney,
  formToProfile,
  profileToForm,
  requestJson,
  validateForm,
  type CalculationResult,
  type FormValues,
  type NumericField,
  type Profile,
} from "@/lib/profile";
import { cn } from "@/lib/utils";

const ProjectionChart = dynamic(
  () => import("./projection-chart").then((module) => module.ProjectionChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        그래프를 준비하고 있습니다.
      </div>
    ),
  },
);

function Field({
  name,
  form,
  errors,
  onChange,
  disabled,
}: {
  name: NumericField;
  form: FormValues;
  errors: Partial<Record<NumericField, string>>;
  onChange: (key: NumericField, value: string) => void;
  disabled: boolean;
}) {
  const unit =
    name === "age" ? "세" : name === "horizon_months" ? "개월" : "원";
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{fieldLabels[name]}</Label>
      <div className="relative">
        <Input
          id={name}
          name={name}
          inputMode="numeric"
          autoComplete="off"
          value={form[name]}
          disabled={disabled}
          aria-invalid={!!errors[name]}
          aria-describedby={errors[name] ? `${name}-error` : undefined}
          onChange={(event) => onChange(name, event.target.value)}
          className="bg-white pr-12 text-right font-medium"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground"
        >
          {unit}
        </span>
      </div>
      {errors[name] && (
        <p
          id={`${name}-error`}
          className="text-xs leading-relaxed text-destructive"
        >
          {errors[name]}
        </p>
      )}
    </div>
  );
}

function FieldGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-4 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div
        aria-hidden="true"
        className="flex items-center gap-2 text-sm font-semibold [&_svg]:size-4 [&_svg]:text-primary"
      >
        {icon}
        {title}
      </div>
      {children}
    </fieldset>
  );
}

function Metric({
  title,
  value,
  note,
  icon,
  testId,
  emphasis = false,
  negative = false,
}: {
  title: string;
  value: string;
  note: string;
  icon: ReactNode;
  testId: string;
  emphasis?: boolean;
  negative?: boolean;
}) {
  return (
    <Card
      className={cn(
        "min-w-0 border-white/80 shadow-[0_3px_16px_#20384e04]",
        emphasis && "border-teal-200/70 bg-[#eff9f6]",
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 [&_svg]:size-4",
              emphasis && "bg-teal-100/70 text-primary",
            )}
          >
            {icon}
          </span>
        </div>
        <p
          data-testid={testId}
          className={cn(
            "metric-number mt-4 text-[clamp(1.15rem,1.9vw,1.8rem)] leading-tight font-bold",
            emphasis && "text-primary",
            negative && "text-destructive",
          )}
        >
          {value}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {note}
        </p>
      </CardContent>
    </Card>
  );
}

function ResultPanel({
  result,
  dirty,
  busy,
  failed,
}: {
  result: CalculationResult;
  dirty: boolean;
  busy: boolean;
  failed: boolean;
}) {
  const { summary, input } = result;
  const stale = dirty || failed;
  const progress = Math.max(0, Math.min(100, Number(summary.achievement_rate)));
  const usedForm = profileToForm(input);
  return (
    <div className="min-w-0 space-y-5" aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-primary" />
          <h2 className="text-sm font-bold">나의 재무 한눈에 보기</h2>
        </div>
        <p
          className={cn(
            "text-xs text-muted-foreground",
            stale && "text-amber-700",
          )}
        >
          {stale ? "이전 계산 기준" : "현재 입력 기준"} · {input.customer.age}세
          ·{" "}
          <span data-testid="goal-period">{input.goal.horizon_months}개월</span>{" "}
          계획
        </p>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-3">
        <Metric
          title="현재 순자산"
          value={formatMoney(summary.current_net_worth)}
          testId="current-net-worth"
          note="현재 총자산에서 부채를 뺀 금액"
          icon={<Wallet />}
        />
        <Metric
          title="월 현금흐름"
          value={formatMoney(summary.monthly_cash_flow)}
          testId="monthly-cash-flow"
          note="월 세후소득 − 월 생활지출"
          icon={
            summary.monthly_cash_flow.startsWith("-") ? (
              <ArrowDownLeft />
            ) : (
              <ArrowUpRight />
            )
          }
          negative={summary.monthly_cash_flow.startsWith("-")}
        />
        <div className="col-span-2 xl:col-span-1">
          <Metric
            title="목표 시점의 주거자금"
            value={formatMoney(summary.final_goal_funds)}
            testId="final-goal-funds"
            note={
              input.assumptions.deposit_returned_at_goal
                ? "주거 저축 + 목표 시점 반환 보증금"
                : "주거 저축만 포함 · 보증금 반환 제외"
            }
            icon={<House />}
            emphasis
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ChartNoAxesCombined className="size-4 text-primary" />
              <CardTitle>내 집을 향한 자금 흐름</CardTitle>
            </div>
            <CardDescription>
              매월 쌓이는 주거자금과 목표까지의 거리를 확인하세요.
            </CardDescription>
          </div>
          <span className="rounded-lg bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
            목표{" "}
            <strong className="ml-1 text-foreground">
              {formatMoney(summary.target_amount)}
            </strong>
          </span>
        </CardHeader>
        <CardContent className="px-3 pt-3 pb-5 sm:px-6">
          <div data-testid="projection-chart">
            <ProjectionChart result={result} />
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-0.5 w-5 bg-[#0a9482]" />
              주거 목적 저축
            </span>
            <span className="flex items-center gap-2">
              <span className="w-5 border-t-2 border-dashed border-[#224b70]" />
              목표재원
            </span>
            <span className="flex items-center gap-2">
              <span className="w-5 border-t border-dashed border-[#8f9bae]" />
              목표 금액
            </span>
          </div>
        </CardContent>
        <div className="flex items-start gap-2 border-t border-border bg-slate-50 px-6 py-3 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {input.assumptions.deposit_returned_at_goal
            ? "보증금은 목표월에 반환되는 것으로 가정합니다. 반환 전에는 사용 가능한 주거자금에 포함하지 않습니다."
            : "보증금 반환을 가정하지 않았습니다. 목표재원에는 주거 목적 저축만 포함됩니다."}
        </div>
      </Card>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Flag className="size-4 text-primary" />
              <h2 className="text-base font-bold">목표 달성 현황</h2>
            </div>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                summary.achieved
                  ? "bg-teal-50 text-primary"
                  : "bg-amber-50 text-amber-800",
              )}
            >
              {summary.achieved ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <CircleHelp className="size-3.5" />
              )}
              {summary.achieved ? "목표 달성 가능" : "추가 계획 필요"}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {input.goal.horizon_months}개월 후 예상 달성률
            </p>
            <p
              data-testid="achievement-rate"
              className="metric-number text-3xl font-bold text-primary"
            >
              {summary.achievement_rate}%
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="주거자금 목표 달성률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={`${summary.achievement_rate}%`}
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>시작</span>
            <span>목표 100%</span>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 rounded-xl bg-slate-50 p-4 min-[420px]:grid-cols-3">
            <div>
              <p className="text-[11px] text-muted-foreground">목표 부족액</p>
              <p
                data-testid="goal-shortfall"
                className="metric-number mt-1.5 text-base font-bold text-amber-800"
              >
                {formatMoney(summary.goal_shortfall)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">
                목표 시점 반환 보증금
              </p>
              <p className="metric-number mt-1.5 text-base font-semibold">
                {formatMoney(summary.deposit_available_at_goal)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">
                목표 시점 주거 저축
              </p>
              <p className="metric-number mt-1.5 text-base font-semibold">
                {formatMoney(summary.final_housing_savings)}
              </p>
            </div>
          </div>
          {summary.goal_surplus !== "0" && (
            <p className="mt-3 text-xs text-primary">
              목표 초과액은 {formatMoney(summary.goal_surplus)}입니다.
            </p>
          )}
        </CardContent>
      </Card>

      {result.warnings.length > 0 && (
        <div
          role="note"
          className="rounded-xl border border-amber-200 bg-amber-50 p-5"
        >
          <h3 className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertCircle className="size-4" />
            계획에서 확인할 점
          </h3>
          <ul className="mt-3 space-y-2 pl-4 text-xs leading-relaxed text-amber-900">
            {result.warnings.map((warning) => (
              <li className="list-disc" key={warning}>
                {warning}
              </li>
            ))}
          </ul>
          {summary.unfunded_shortfall !== "0" && (
            <p className="mt-3 text-xs font-semibold text-amber-900">
              미충당 적자 {formatMoney(summary.unfunded_shortfall)} · 최초 발생{" "}
              {summary.first_shortfall_month}개월
            </p>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <ShieldCheck className="size-4 text-primary" />이 계획의 계산 가정
          </h2>
          <ul className="mt-4 grid gap-3 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2">
            {result.assumptions.map((assumption) => (
              <li className="flex items-start gap-2" key={assumption}>
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                {assumption}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <details>
          <summary className="flex items-center justify-between gap-3 p-5 text-sm font-semibold sm:px-6">
            월별 상세 내역
            <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              0~{input.goal.horizon_months}개월
              <ChevronDown className="size-4" />
            </span>
          </summary>
          <div
            tabIndex={0}
            role="region"
            aria-label="월별 자금 흐름 표"
            className="max-h-[440px] overflow-auto border-t border-border"
          >
            <table
              data-testid="monthly-table"
              className="w-full min-w-[1030px] border-collapse text-right text-xs tabular-nums"
            >
              <caption className="sr-only">
                계산 결과의 월별 자금 흐름. 단위는 원입니다.
              </caption>
              <thead className="sticky top-0 bg-slate-100 text-muted-foreground">
                <tr>
                  {[
                    "시점",
                    "소득",
                    "생활지출",
                    "현금흐름",
                    "주거 저축",
                    "반환 보증금",
                    "목표재원",
                    "총자산",
                    "순자산",
                    "누적 미충당 적자",
                  ].map((title) => (
                    <th
                      scope="col"
                      className="px-4 py-3 font-medium whitespace-nowrap"
                      key={title}
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.monthly.map((row) => (
                  <tr
                    key={row.month}
                    data-month={row.month}
                    className="border-b border-border last:border-0 even:bg-slate-50/60"
                  >
                    <th
                      scope="row"
                      className="px-4 py-3 font-medium whitespace-nowrap"
                    >
                      {row.month}개월
                    </th>
                    {(
                      [
                        "income",
                        "expenses",
                        "cash_flow",
                        "housing_savings",
                        "returned_deposit",
                        "goal_funds",
                        "total_assets",
                        "net_worth",
                        "unfunded_shortfall",
                      ] as const
                    ).map((key) => (
                      <td
                        key={key}
                        data-field={key}
                        className={cn(
                          "px-4 py-3 whitespace-nowrap",
                          key === "goal_funds" && "font-semibold text-primary",
                        )}
                      >
                        {formatMoney(row[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <Card>
        <details>
          <summary className="flex items-center justify-between p-5 text-sm font-semibold sm:px-6">
            이번 계산에 사용한 입력
            <ChevronDown className="size-4 text-muted-foreground" />
          </summary>
          <dl className="grid gap-x-6 gap-y-3 border-t border-border p-5 text-xs sm:grid-cols-2 sm:px-6">
            {(Object.keys(fieldLabels) as NumericField[]).map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-3"
              >
                <dt className="text-muted-foreground">{fieldLabels[key]}</dt>
                <dd className="font-medium tabular-nums">
                  {key === "age"
                    ? `${usedForm[key]}세`
                    : key === "horizon_months"
                      ? `${usedForm[key]}개월`
                      : formatMoney(usedForm[key])}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">목표 시점에 보증금 반환</dt>
              <dd className="font-medium">
                {input.assumptions.deposit_returned_at_goal ? "포함" : "제외"}
              </dd>
            </div>
          </dl>
        </details>
      </Card>
    </div>
  );
}

export function FinancialPlanner() {
  const [form, setForm] = useState<FormValues | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<NumericField, string>>
  >({});
  const requestId = useRef(0);
  const dirty = !!(
    form &&
    result &&
    JSON.stringify(form) !== JSON.stringify(profileToForm(result.input))
  );

  const calculate = useCallback(
    async (profile: Profile, id: number, signal?: AbortSignal) => {
      const response = await requestJson<CalculationResult>("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
        signal,
      });
      if (id === requestId.current) {
        setResult(response);
        setForm(profileToForm(response.input));
      }
    },
    [],
  );

  const loadSample = useCallback(
    async (signal?: AbortSignal) => {
      const id = ++requestId.current;
      try {
        const profile = await requestJson<Profile>("/api/sample-profile", {
          signal,
        });
        if (id !== requestId.current) return;
        setForm(profileToForm(profile));
        await calculate(profile, id, signal);
      } catch (cause) {
        if (signal?.aborted || id !== requestId.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "예시를 불러오지 못했습니다. 다시 시도해주세요.",
        );
      } finally {
        if (!signal?.aborted && id === requestId.current) setBusy(false);
      }
    },
    [calculate],
  );

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;
    requestJson<Profile>("/api/sample-profile", { signal: controller.signal })
      .then((profile) => {
        if (controller.signal.aborted || id !== requestId.current) return;
        setForm(profileToForm(profile));
        return calculate(profile, id, controller.signal);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || id !== requestId.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "예시를 불러오지 못했습니다. 다시 시도해주세요.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted && id === requestId.current)
          setBusy(false);
      });
    return () => controller.abort();
  }, [calculate]);

  function resetSample() {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    void loadSample();
  }

  function changeField(key: NumericField, value: string) {
    setForm((previous) => previous && { ...previous, [key]: value });
    setFieldErrors((previous) => ({ ...previous, [key]: undefined }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || busy) return;
    const errors = validateForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError(
        "입력 오류가 있습니다. 표시된 항목을 수정하고 다시 계산해주세요.",
      );
      document.getElementById(Object.keys(errors)[0])?.focus();
      return;
    }
    const id = ++requestId.current;
    setBusy(true);
    setError(null);
    try {
      await calculate(formToProfile(form), id);
    } catch (cause) {
      if (id === requestId.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "계산에 실패했습니다. 다시 시도해주세요.",
        );
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }

  const status = busy
    ? result
      ? "계산 중 · 이전 계산 결과가 표시됩니다."
      : "계산 중 · 기본 예시를 불러오고 있습니다."
    : error
      ? result
        ? "계산 실패 · 이전 계산 결과입니다. 입력을 확인하고 다시 시도해주세요."
        : "계산 실패 · 다시 시도해주세요."
      : dirty
        ? "입력이 변경되었습니다. 이전 계산 결과입니다."
        : "계산 완료 · 현재 입력 기준의 결과입니다.";
  const field = (name: NumericField) =>
    form && (
      <Field
        key={name}
        name={name}
        form={form}
        errors={fieldErrors}
        onChange={changeField}
        disabled={busy}
      />
    );

  return (
    <>
      <a
        href="#planner-form"
        className="sr-only z-50 rounded bg-white p-3 focus:not-sr-only focus:absolute"
      >
        재무정보 입력으로 이동
      </a>
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-5 sm:px-8">
          <Link
            href="/"
            aria-label="LifePath AI 홈"
            className="flex items-center gap-2.5"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-white">
              <Compass className="size-6" strokeWidth={1.7} />
            </span>
            <span className="text-xl font-bold tracking-tight">
              LifePath<span className="ml-1 font-normal text-primary">AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-muted-foreground sm:block">
              나의 재무계획
            </span>
            <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-[10px] font-semibold tracking-wide text-primary">
              기본 재무설계
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 pt-6 pb-12 sm:px-8 sm:pt-8">
        <section className="relative mb-7 overflow-hidden rounded-2xl bg-[#142c43] px-6 py-7 text-white sm:px-8">
          <div className="hero-orbit" />
          <div className="relative flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.16em] text-teal-200">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-300" /> YOUR
                NEXT CHAPTER
              </p>
              <h1 className="text-2xl leading-snug font-bold tracking-tight sm:text-[28px]">
                미래를 위한 계획, 숫자로 선명하게.
              </h1>
              <p className="mt-2 text-xs leading-relaxed text-slate-300 sm:text-sm">
                오늘의 자산과 현금흐름으로 내일의 주거자금을 그려보세요.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-[11px] text-slate-200">
              <Landmark className="size-3.5 text-teal-200" />
              주거자금 계획 · 기본 계산
            </div>
          </div>
        </section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p
            role="status"
            aria-live="polite"
            data-testid="calculation-status"
            className={cn(
              "flex items-center gap-2 text-xs leading-relaxed text-muted-foreground",
              (dirty || error) && !busy && "text-amber-800",
            )}
          >
            {busy ? (
              <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
            ) : error || dirty ? (
              <AlertCircle className="size-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
            )}
            {status}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetSample}
            disabled={busy}
          >
            <RefreshCw />
            기본 예시 불러오기
          </Button>
        </div>
        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-relaxed text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}
        <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-primary" />내 재무정보
              </CardTitle>
              <CardDescription>
                정보를 입력하고 나의 계획을 확인하세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {form ? (
                <form
                  id="planner-form"
                  noValidate
                  onSubmit={onSubmit}
                  className="space-y-5"
                >
                  <FieldGroup title="기본 정보" icon={<Compass />}>
                    <div className="grid grid-cols-2 gap-3">
                      {field("age")}
                      {field("horizon_months")}
                    </div>
                  </FieldGroup>
                  <FieldGroup title="매월 들어오고 나가는 돈" icon={<Wallet />}>
                    {field("monthly_net")}
                    {field("monthly_living")}
                  </FieldGroup>
                  <FieldGroup title="현재 보유 자산" icon={<Landmark />}>
                    {field("rental_deposit")}
                    {field("housing_savings")}
                    <div className="grid grid-cols-2 gap-3">
                      {field("emergency_fund")}
                      {field("long_term_investments")}
                    </div>
                    <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
                      <ShieldCheck className="mt-0.5 size-3 shrink-0" />
                      비상자금과 장기투자는 주거자금에서 제외해요.
                    </p>
                    {field("current_balance")}
                  </FieldGroup>
                  <FieldGroup title="나의 주거자금 목표" icon={<Flag />}>
                    {field("target_amount")}
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-teal-100 bg-teal-50/60 p-3">
                      <input
                        type="checkbox"
                        aria-label="목표 시점에 보증금 반환"
                        checked={form.deposit_returned_at_goal}
                        disabled={busy}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            deposit_returned_at_goal: event.target.checked,
                          })
                        }
                        className="mt-0.5 size-4 shrink-0 accent-[#087d72]"
                      />
                      <span>
                        <span className="text-xs font-medium">
                          목표 시점에 보증금 반환
                        </span>
                        <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                          반환 가정은 마지막 달의 목표재원에만 반영됩니다.
                        </span>
                      </span>
                    </label>
                  </FieldGroup>
                  <div className="border-t border-border pt-5">
                    <Button
                      type="submit"
                      size="lg"
                      disabled={busy}
                      className="w-full"
                    >
                      {busy ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <ChartNoAxesCombined />
                      )}
                      재무계획 계산하기{!busy && <ArrowRight />}
                    </Button>
                    <p className="mt-3 text-center text-[10px] text-muted-foreground">
                      금액은 원 단위 · 수익률과 물가상승률 0% 가정
                    </p>
                  </div>
                </form>
              ) : (
                <div
                  id="planner-form"
                  className="space-y-4"
                  aria-label="입력 정보를 준비하고 있습니다"
                >
                  {Array.from({ length: 5 }, (_, index) => (
                    <div
                      key={index}
                      className="h-16 animate-pulse rounded-lg bg-muted"
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {result ? (
            <ResultPanel
              result={result}
              dirty={dirty}
              busy={busy}
              failed={!!error}
            />
          ) : (
            <div className="min-w-0 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="h-36 animate-pulse rounded-2xl bg-white" />
                <div className="h-36 animate-pulse rounded-2xl bg-white" />
              </div>
              <Card className="flex min-h-96 flex-col items-center justify-center px-6 text-center">
                <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-teal-50 text-primary">
                  {busy ? (
                    <LoaderCircle className="size-6 animate-spin" />
                  ) : (
                    <RefreshCw className="size-6" />
                  )}
                </span>
                <h2 className="text-base font-semibold">
                  {busy
                    ? "나의 재무계획을 준비하고 있어요"
                    : "재무계획을 불러오지 못했어요"}
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {busy
                    ? "기본 예시를 불러와 월별 자금 흐름을 계산합니다."
                    : "기본 예시 불러오기를 눌러 다시 시도해주세요."}
                </p>
                {!busy && (
                  <Button
                    className="mt-5"
                    variant="outline"
                    onClick={resetSample}
                  >
                    다시 시도
                  </Button>
                )}
              </Card>
            </div>
          )}
        </div>
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-[10px] leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <Sparkles className="size-3" />
            LifePath AI · 더 선명한 내일을 위한 첫걸음
          </p>
          <p>
            입력한 조건에 따른 단순 추정이며, 실제 자산의 변화를 보장하지
            않습니다.
          </p>
        </footer>
      </main>
    </>
  );
}
