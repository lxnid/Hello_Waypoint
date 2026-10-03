/** Exact fixed-point arithmetic for capacity and quota decisions. */
export function fixed(value: string, scale: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error(`Invalid nonnegative decimal: ${value}`);
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale)))
    throw new Error(`Decimal exceeds ${scale} places: ${value}`);
  return (
    BigInt(whole!) * 10n ** BigInt(scale) + BigInt(fraction.slice(0, scale).padEnd(scale, '0'))
  );
}
export function decimal(value: bigint, scale: number): string {
  const divisor = 10n ** BigInt(scale);
  return `${value / divisor}.${(value % divisor).toString().padStart(scale, '0')}`;
}
