import { describe, expect, it } from 'vitest';
import { planningWindow, planningBlockReason } from '../src/modules/operations/planning-window.js';

describe('server-clock live planning window', () => {
  it('keeps planning closed through the final accepted intake millisecond', () => {
    expect(planningWindow(new Date('2026-10-04T10:29:59.999Z')).planningOpen).toBe(false);
    expect(planningWindow(new Date('2026-10-04T10:30:00.000Z')).planningOpen).toBe(false);
    expect(planningWindow(new Date('2026-10-04T10:30:00.001Z')).planningOpen).toBe(true);
  });
  it('uses Colombo midnight rather than the UTC date and closes each new intake day', () => {
    const window = planningWindow(new Date('2026-10-04T20:00:00Z'));
    expect(window.opensAt).toBe('2026-10-05T10:30:00.000Z');
    expect(window.planningOpen).toBe(false);
  });
  it('blocks live planning before cutoff but permits isolated historical simulations', () => {
    const at = new Date('2026-10-04T08:00:00Z');
    expect(planningBlockReason('LIVE', at)).toContain('4:00 PM');
    expect(planningBlockReason('SCENARIO', at)).toBeNull();
    expect(planningBlockReason('LIVE', new Date('2026-10-04T11:00:00Z'))).toBeNull();
  });
});
