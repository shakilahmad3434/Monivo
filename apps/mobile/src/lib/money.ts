export const money = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
    amount / 100,
  );
export function parsePaise(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const [rupees = '0', fraction = ''] = value.trim().split('.');
  const amount = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount <= 100_000_000 ? amount : null;
}
