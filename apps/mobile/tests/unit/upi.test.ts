import { describe, expect, it } from 'vitest';
import { upiPaymentUri } from '../../src/lib/upi';
import { upiIdSchema } from '@monivo/shared';

describe('UPI handoff URI', () => {
  it('uses exact integer-paise amounts and only the intended parameters', () => {
    const uri = new URL(
      upiPaymentUri(' test.user@BANK ', 'Test Member', 10001),
    );
    expect(uri.protocol).toBe('upi:');
    expect(uri.host).toBe('pay');
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      pa: 'test.user@bank',
      pn: 'Test Member',
      am: '100.01',
      cu: 'INR',
      tn: 'Monivo shared expense',
    });
    expect(
      new URL(upiPaymentUri('test@bank', 'Test', 1)).searchParams.get('am'),
    ).toBe('0.01');
  });
  it('encodes names so they cannot inject a different recipient or amount', () => {
    const uri = new URL(
      upiPaymentUri('test@bank', 'A & pa=other@bank / ₹', 100),
    );
    expect(uri.searchParams.get('pn')).toBe('A & pa=other@bank / ₹');
    expect(uri.searchParams.getAll('pa')).toEqual(['test@bank']);
    expect(uri.searchParams.get('am')).toBe('1.00');
  });
  it('rejects malformed IDs, URI injection, and invalid money', () => {
    for (const id of [
      'test',
      'test@@bank',
      'upi://pay',
      'test@bank&am=1',
      'test user@bank',
      '@bank',
      'test@',
      'a'.repeat(101) + '@bank',
    ])
      expect(upiIdSchema.safeParse(id).success).toBe(false);
    for (const amount of [0, -1, 1.1, NaN, 100_000_001])
      expect(() => upiPaymentUri('test@bank', 'Test', amount)).toThrow();
    expect(() => upiPaymentUri('test@bank', '', 100)).toThrow();
  });
});
