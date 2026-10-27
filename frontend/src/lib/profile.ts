export interface Profile {
  customer: { age: number };
  income: { monthly_net: string };
  expenses: { monthly_living: string };
  assets: {
    rental_deposit: string;
    housing_savings: string;
    emergency_fund: string;
    long_term_investments: string;
  };
  liabilities: { current_balance: string };
  goal: { target_amount: string; horizon_months: number };
  assumptions: { deposit_returned_at_goal: boolean };
}

export interface MonthlyRecord {
  month: number;
  income: string;
  expenses: string;
  cash_flow: string;
  housing_savings: string;
  returned_deposit: string;
  goal_funds: string;
  total_assets: string;
  net_worth: string;
  unfunded_shortfall: string;
}

export interface CalculationResult {
  input: Profile;
  summary: {
    current_total_assets: string;
    current_net_worth: string;
    current_liquid_housing_funds: string;
    monthly_cash_flow: string;
    total_savings_change: string;
    final_housing_savings: string;
    deposit_available_at_goal: string;
    final_goal_funds: string;
    target_amount: string;
    goal_shortfall: string;
    goal_surplus: string;
    achievement_rate: string;
    projected_net_worth: string;
    unfunded_shortfall: string;
    achieved: boolean;
    first_shortfall_month: number | null;
  };
  monthly: MonthlyRecord[];
  assumptions: string[];
  warnings: string[];
}

export type FormValues = {
  age: string;
  monthly_net: string;
  monthly_living: string;
  rental_deposit: string;
  housing_savings: string;
  emergency_fund: string;
  long_term_investments: string;
  current_balance: string;
  target_amount: string;
  horizon_months: string;
  deposit_returned_at_goal: boolean;
};

export type NumericField = Exclude<
  keyof FormValues,
  "deposit_returned_at_goal"
>;

export const fieldLabels: Record<NumericField, string> = {
  age: "나이",
  monthly_net: "월 세후소득",
  monthly_living: "월 생활지출",
  rental_deposit: "보증금",
  housing_savings: "주거 목적 저축",
  emergency_fund: "비상자금",
  long_term_investments: "장기투자",
  current_balance: "현재 부채",
  target_amount: "목표 금액",
  horizon_months: "목표 기간 (개월)",
};

export function profileToForm(profile: Profile): FormValues {
  return {
    age: String(profile.customer.age),
    monthly_net: profile.income.monthly_net,
    monthly_living: profile.expenses.monthly_living,
    ...profile.assets,
    current_balance: profile.liabilities.current_balance,
    target_amount: profile.goal.target_amount,
    horizon_months: String(profile.goal.horizon_months),
    ...profile.assumptions,
  };
}

export function formToProfile(form: FormValues): Profile {
  return {
    customer: { age: Number(form.age) },
    income: { monthly_net: form.monthly_net },
    expenses: { monthly_living: form.monthly_living },
    assets: {
      rental_deposit: form.rental_deposit,
      housing_savings: form.housing_savings,
      emergency_fund: form.emergency_fund,
      long_term_investments: form.long_term_investments,
    },
    liabilities: { current_balance: form.current_balance },
    goal: {
      target_amount: form.target_amount,
      horizon_months: Number(form.horizon_months),
    },
    assumptions: { deposit_returned_at_goal: form.deposit_returned_at_goal },
  };
}

export function validateForm(
  form: FormValues,
): Partial<Record<NumericField, string>> {
  const errors: Partial<Record<NumericField, string>> = {};
  for (const key of Object.keys(fieldLabels) as NumericField[]) {
    const value = form[key];
    const min =
      key === "age"
        ? 18n
        : key === "horizon_months" || key === "target_amount"
          ? 1n
          : 0n;
    const max =
      key === "age"
        ? 100n
        : key === "horizon_months"
          ? 600n
          : 1_000_000_000_000n;
    if (!/^\d+$/.test(value))
      errors[key] = "빈칸 없이 0 이상의 정수로 입력해주세요.";
    else if (BigInt(value) < min || BigInt(value) > max)
      errors[key] =
        `${min.toLocaleString("ko-KR")}~${max.toLocaleString("ko-KR")} 범위로 입력해주세요.`;
  }
  return errors;
}

const moneyFormatter = new Intl.NumberFormat("ko-KR");
export function formatMoney(amount: string): string {
  return `${moneyFormatter.format(BigInt(amount))}원`;
}

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!response.ok) {
    if (response.status === 422)
      throw new Error(
        "입력값이 허용 범위에 맞지 않습니다. 각 항목을 확인하고 다시 계산해주세요.",
      );
    throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  return response.json() as Promise<T>;
}
