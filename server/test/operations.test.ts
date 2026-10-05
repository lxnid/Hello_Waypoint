import { describe, expect, it } from 'vitest';
import { decimal, fixed } from '../src/modules/operations/decimal.js';
import { validateDailyBudgets } from '../src/modules/operations/planning.js';
import { cutoffRunOffset } from '../src/modules/operations/service.js';

describe('cutoff and exact capacity arithmetic', () => {
  it('includes exactly 16:00 Colombo but excludes the next millisecond', () => {
    expect(cutoffRunOffset(new Date('2026-03-28T10:29:59.999Z'))).toBe(0);
    expect(cutoffRunOffset(new Date('2026-03-28T10:30:00.000Z'))).toBe(0);
    expect(cutoffRunOffset(new Date('2026-03-28T10:30:00.001Z'))).toBe(1);
  });
  it('compares decimals without floating point capacity overflow', () => {
    expect(fixed('0.100', 3) + fixed('0.200', 3)).toBe(fixed('0.300', 3));
    expect(decimal(fixed('5510.00', 2), 2)).toBe('5510.00');
    expect(() => fixed('0.0001', 3)).toThrow('exceeds');
    expect(() => fixed('-1', 2)).toThrow('Invalid');
  });
});

describe('combined vehicle day budgets', () => {
  const trip = (brand_id: string, minutes: string) => ({ vehicle_id: 'VEH001', brand_id, minutes });
  it('combines Fresh trips and combines Style with Tech', () => {
    expect(() => validateDailyBudgets([trip('Fresh', '140'), trip('Fresh', '140')])).toThrow(
      'combined',
    );
    expect(() => validateDailyBudgets([trip('Style', '250'), trip('Tech', '250')])).toThrow(
      'combined',
    );
    expect(() => validateDailyBudgets([trip('Fresh', '270'), trip('Tech', '480')])).not.toThrow();
    expect(() =>
      validateDailyBudgets([trip('Fresh', '1'), trip('Style', '1'), trip('Tech', '1')]),
    ).toThrow('combined');
  });
});
