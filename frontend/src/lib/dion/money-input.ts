import { fieldKrw } from "./money-format";

export type MoneyParts = { man: string; cheon: string; won: string };

// Presentation-only unit conversion. Reading never rewrites the stored field.
export function splitMoneyInput(value: { state: string; raw_value: unknown; unit: string }): MoneyParts {
  if (typeof value.raw_value === "string" && value.raw_value.length >= 50) return { man: "", cheon: "", won: "" };
  const raw = fieldKrw(value);
  if (raw === null) return { man: "", cheon: "", won: "" };
  const n = BigInt(raw);
  return {
    man: n >= 10000n || n === 0n ? (n / 10000n).toString() : "",
    cheon: n % 10000n / 1000n ? (n % 10000n / 1000n).toString() : "",
    won: n % 1000n ? (n % 1000n).toString() : "",
  };
}

export function joinMoneyInput(parts: MoneyParts, unit: string): string | null {
  if (Object.values(parts).every(v => v === "")) return null;
  if (Object.values(parts).some(v => !/^\d*$/.test(v)) || BigInt(parts.cheon || "0") > 9n || BigInt(parts.won || "0") > 999n) return null;
  const n = BigInt(parts.man || "0") * 10000n + BigInt(parts.cheon || "0") * 1000n + BigInt(parts.won || "0");
  if (unit === "KRW") return n.toString();
  if (unit !== "KRW_10000") return null;
  const fraction = (n % 10000n).toString().padStart(4, "0").replace(/0+$/, "");
  return `${n / 10000n}${fraction ? `.${fraction}` : ""}`;
}
