export type Member = { id: string; name: string };
export type Group = {
  id: string;
  name: string;
  subtitle: string;
  memberIds: string[];
  kind: 'home' | 'trip' | 'friends';
};
export type Expense = {
  id: string;
  groupId: string;
  description: string;
  amount: number;
  payerId: string;
  shares: Record<string, number>;
  date: string;
};
export type Settlement = {
  id: string;
  groupId: string;
  fromId: string;
  toId: string;
  amount: number;
  status: 'pending' | 'confirmed' | 'rejected';
  date: string;
};
export type DemoState = {
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
};
export const currentUserId = 'you';
export const members: Member[] = [
  { id: 'you', name: 'You' },
  { id: 'rahul', name: 'Rahul' },
  { id: 'neha', name: 'Neha' },
  { id: 'aman', name: 'Aman' },
];
export const memberName = (id: string) =>
  members.find((member) => member.id === id)?.name ?? 'Unknown member';
export const money = (amount: number) =>
  `₹${(amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function parseAmount(value: string): number | null {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole = '0', fraction = ''] = value.trim().split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function equalShares(
  amount: number,
  ids: string[],
): Record<string, number> {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    ids.length === 0 ||
    new Set(ids).size !== ids.length
  )
    throw new Error('Invalid split');
  const base = Math.floor(amount / ids.length);
  return Object.fromEntries(
    ids.map((id, index) => [id, base + (index < amount % ids.length ? 1 : 0)]),
  );
}

// Direct balances only: positive means this friend owes you. Pending payments do not change balances.
export function balancesForGroup(
  state: DemoState,
  groupId: string,
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const expense of state.expenses.filter(
    (item) => item.groupId === groupId,
  )) {
    if (expense.payerId === currentUserId) {
      for (const [id, amount] of Object.entries(expense.shares)) {
        if (id !== currentUserId) balances[id] = (balances[id] ?? 0) + amount;
      }
    } else {
      balances[expense.payerId] =
        (balances[expense.payerId] ?? 0) - (expense.shares[currentUserId] ?? 0);
    }
  }
  for (const payment of state.settlements.filter(
    (item) => item.groupId === groupId && item.status === 'confirmed',
  )) {
    if (payment.fromId === currentUserId)
      balances[payment.toId] = (balances[payment.toId] ?? 0) + payment.amount;
    if (payment.toId === currentUserId)
      balances[payment.fromId] =
        (balances[payment.fromId] ?? 0) - payment.amount;
  }
  return balances;
}

export function seedDemo(): DemoState {
  return {
    groups: [
      {
        id: 'flat',
        name: 'The everyday crew',
        subtitle: 'Home, food & everything between',
        memberIds: ['you', 'rahul', 'neha'],
        kind: 'home',
      },
      {
        id: 'goa',
        name: 'Goa getaway',
        subtitle: 'Good times. Shared fairly.',
        memberIds: ['you', 'aman', 'rahul'],
        kind: 'trip',
      },
      {
        id: 'coffee',
        name: 'Coffee club',
        subtitle: 'A little catch-up, a lot of coffee',
        memberIds: ['you', 'neha'],
        kind: 'friends',
      },
    ],
    expenses: [
      {
        id: 'groceries',
        groupId: 'flat',
        description: 'Weekend groceries',
        amount: 60000,
        payerId: 'you',
        shares: equalShares(60000, ['you', 'rahul', 'neha']),
        date: '2026-11-01T09:00:00+05:30',
      },
      {
        id: 'dinner',
        groupId: 'flat',
        description: 'Dinner at our usual',
        amount: 90000,
        payerId: 'rahul',
        shares: equalShares(90000, ['you', 'rahul', 'neha']),
        date: '2026-10-31T20:00:00+05:30',
      },
      {
        id: 'stay',
        groupId: 'goa',
        description: 'Our beachside stay',
        amount: 240000,
        payerId: 'aman',
        shares: equalShares(240000, ['you', 'aman', 'rahul']),
        date: '2026-10-30T12:00:00+05:30',
      },
    ],
    settlements: [
      {
        id: 'neha-payment',
        groupId: 'flat',
        fromId: 'neha',
        toId: 'you',
        amount: 10000,
        status: 'pending',
        date: '2026-11-01T10:00:00+05:30',
      },
    ],
  };
}
