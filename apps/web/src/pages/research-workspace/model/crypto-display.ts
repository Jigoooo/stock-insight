export function formatCryptoMagnitude(value: string | null, unit: string | null): string {
  if (value === null || unit === null) return '정량값 없음';
  const number = Number(value);
  if (!Number.isFinite(number)) return `${value} ${unit}`;
  if (number !== 0 && Math.abs(number) < 0.0001) {
    return `${number < 0 ? '>-0.0001' : '<0.0001'} ${unit}`;
  }
  return `${new Intl.NumberFormat('ko-KR', { maximumSignificantDigits: 8 }).format(number)} ${unit}`;
}

export function formatCryptoConfidence(value: number | null): string {
  if (value === null) return '검토 중';
  if (value === 1) return '신뢰도 100%';
  const percent = Math.floor(value * 10_000) / 100;
  return `신뢰도 ${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(percent)}%`;
}
