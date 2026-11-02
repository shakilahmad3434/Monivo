import { paiseSchema, upiIdSchema } from '@monivo/shared';

export function upiPaymentUri(upiId: string, name: string, amount: number) {
  const address = upiIdSchema.parse(upiId);
  paiseSchema.parse(amount);
  if (!name.trim() || name.length > 50)
    throw new Error('A recipient name is required.');
  const values = {
    pa: address,
    pn: name.trim(),
    am: `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`,
    cu: 'INR',
    tn: 'Monivo shared expense',
  };
  return `upi://pay?${Object.entries(values)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')}`;
}
