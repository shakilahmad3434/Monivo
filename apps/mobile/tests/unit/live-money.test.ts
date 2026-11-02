import { describe, it, expect } from 'vitest';
import { splitEqually, expenseInputSchema } from '@monivo/shared';
import { parsePaise } from '../../src/lib/money';

describe('Live expense money', () => {
  it('parses exact paise and rejects precision loss or excessive amounts', () => {
    expect(parsePaise('0.01')).toBe(1);
    expect(parsePaise(' 125.50 ')).toBe(12550);
    expect(parsePaise('0')).toBe(0);
    for (const s of ['1.001', '1e3', '-1', '', '1000000.01'])
      expect(parsePaise(s)).toBeNull();
  });
  it('assigns remainder independently of selection order and rejects mismatched totals', () => {
    const a = 'a'.repeat(24),
      b = 'b'.repeat(24);
    expect(splitEqually(1, [b, a])).toEqual([
      { userId: a, amount: 1 },
      { userId: b, amount: 0 },
    ]);
    expect(
      expenseInputSchema.safeParse({
        description: 'Tea',
        amount: 1,
        payerId: a,
        splitMode: 'custom',
        shares: [{ userId: b, amount: 0 }],
      }).success,
    ).toBe(false);
  });
});
