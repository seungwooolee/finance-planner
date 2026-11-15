import { formatKrw } from "@/lib/dion/money-format";

export function MoneyAmount({ value }: { value: unknown }) {
  const display = formatKrw(value);
  const tail = display.match(/\S+ ?원$/)?.[0];
  if (!tail) return display;
  return <>{display.slice(0, -tail.length)}<span className="d-money-tail">{tail}</span></>;
}
