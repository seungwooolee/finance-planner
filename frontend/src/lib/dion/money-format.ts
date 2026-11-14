// Exact integer KRW formatting only; no rounding or financial policy.
export function formatKrw(value: unknown): string {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return '확인 대기';
  const n = BigInt(value), absolute = n < 0n ? -n : n;
  if (!absolute) return '0원';
  if (absolute < 10000n) return `${n < 0n ? '−' : ''}${absolute.toLocaleString('ko-KR')}원`;
  const jo = absolute / 1000000000000n, eok = absolute % 1000000000000n / 100000000n, man = absolute % 100000000n / 10000n;
  const remainder = absolute % 10000n;
  const parts: string[] = [];
  if (jo) parts.push(`${jo.toLocaleString('ko-KR')}조`);
  if (eok) parts.push(`${eok.toLocaleString('ko-KR')}억`);
  if (man) parts.push(`${man.toLocaleString('ko-KR')}만`);
  if (remainder) parts.push(remainder % 1000n === 0n ? `${remainder / 1000n}천` : remainder.toLocaleString('ko-KR'));
  return `${n < 0n ? '−' : ''}${parts.join(' ')}${remainder ? ' ' : ''}원`;
}
export function fieldKrw(value: { state: string; raw_value: unknown; unit: string }): string | null {
  if (value.state !== 'KNOWN' || typeof value.raw_value !== 'string') return null;
  const raw = value.raw_value.replaceAll(',', '');
  if (value.unit === 'KRW') return /^\d+$/.test(raw) ? BigInt(raw).toString() : null;
  if (value.unit !== 'KRW_10000' || !/^\d+(?:\.\d{1,4})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  return BigInt(whole + fraction.padEnd(4, '0')).toString();
}
