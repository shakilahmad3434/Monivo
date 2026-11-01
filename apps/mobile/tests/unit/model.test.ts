import { describe, expect, it } from 'vitest';
import {
  balancesForGroup,
  equalShares,
  parseAmount,
  seedDemo,
} from '../../src/demo/model';

describe('Sample expense calculations', () => {
  it('parses rupees without rounding fractional paise or accepting invalid amounts', () => {
    expect(parseAmount('125.50')).toBe(12550);
    expect(parseAmount('0.01')).toBe(1);
    for (const value of ['0', '-1', '1.001', '1e3', 'NaN', ''])
      expect(parseAmount(value)).toBeNull();
  });
  it('assigns remainder paise deterministically and preserves the total', () => {
    const shares = equalShares(100, ['you', 'rahul', 'neha']);
    expect(shares).toEqual({ you: 34, rahul: 33, neha: 33 });
    expect(Object.values(shares).reduce((sum, value) => sum + value, 0)).toBe(
      100,
    );
    expect(() => equalShares(100, [])).toThrow();
    expect(() => equalShares(100, ['you', 'you'])).toThrow();
  });
  it('only applies confirmed settlements to the correct group and person', () => {
    const state = seedDemo();
    expect(balancesForGroup(state, 'flat')).toEqual({
      rahul: -10000,
      neha: 20000,
    });
    const pending = state.settlements[0];
    if (!pending) throw new Error('Missing fixture');
    pending.status = 'confirmed';
    expect(balancesForGroup(state, 'flat')).toEqual({
      rahul: -10000,
      neha: 10000,
    });
    expect(balancesForGroup(state, 'goa')).toEqual({ aman: -80000 });
    pending.status = 'rejected';
    expect(balancesForGroup(state, 'flat').neha).toBe(20000);
  });
});
