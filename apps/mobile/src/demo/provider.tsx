import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  balancesForGroup,
  currentUserId,
  seedDemo,
  type DemoState,
  type Expense,
  type Group,
  type Settlement,
} from './model';

type DemoContextValue = {
  state: DemoState;
  addExpense: (expense: Omit<Expense, 'id' | 'date'>) => void;
  addGroup: (group: Omit<Group, 'id'>) => void;
  recordPayment: (
    payment: Omit<Settlement, 'id' | 'date' | 'status' | 'fromId'>,
  ) => void;
  respondToPayment: (id: string, status: 'confirmed' | 'rejected') => void;
};
const DemoContext = createContext<DemoContextValue | null>(null);
let sequence = 0;
const nextId = () => `demo-${Date.now()}-${++sequence}`;

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(seedDemo);
  const addExpense: DemoContextValue['addExpense'] = (expense) => {
    const group = state.groups.find((item) => item.id === expense.groupId);
    if (
      !group ||
      !group.memberIds.includes(expense.payerId) ||
      !expense.description.trim() ||
      !Number.isSafeInteger(expense.amount) ||
      expense.amount <= 0 ||
      Object.keys(expense.shares).length === 0 ||
      Object.entries(expense.shares).some(
        ([id, amount]) =>
          !group.memberIds.includes(id) ||
          !Number.isSafeInteger(amount) ||
          amount < 0,
      ) ||
      Object.values(expense.shares).reduce((sum, amount) => sum + amount, 0) !==
        expense.amount
    )
      throw new Error('Check the expense and split amounts.');
    setState((previous) => ({
      ...previous,
      expenses: [
        { ...expense, id: nextId(), date: new Date().toISOString() },
        ...previous.expenses,
      ],
    }));
  };
  const addGroup: DemoContextValue['addGroup'] = (group) => {
    if (
      !group.name.trim() ||
      group.memberIds.length < 2 ||
      !group.memberIds.includes(currentUserId)
    )
      throw new Error('Add a group name and at least one friend.');
    setState((previous) => ({
      ...previous,
      groups: [...previous.groups, { ...group, id: nextId() }],
    }));
  };
  const recordPayment: DemoContextValue['recordPayment'] = (payment) => {
    setState((previous) => {
      const outstanding = -(
        balancesForGroup(previous, payment.groupId)[payment.toId] ?? 0
      );
      const pending = previous.settlements
        .filter(
          (item) =>
            item.status === 'pending' &&
            item.fromId === currentUserId &&
            item.toId === payment.toId &&
            item.groupId === payment.groupId,
        )
        .reduce((sum, item) => sum + item.amount, 0);
      if (
        !Number.isSafeInteger(payment.amount) ||
        payment.amount <= 0 ||
        payment.amount > outstanding - pending
      )
        return previous;
      return {
        ...previous,
        settlements: [
          {
            ...payment,
            id: nextId(),
            fromId: currentUserId,
            status: 'pending',
            date: new Date().toISOString(),
          },
          ...previous.settlements,
        ],
      };
    });
  };
  const respondToPayment: DemoContextValue['respondToPayment'] = (
    id,
    status,
  ) => {
    setState((previous) => ({
      ...previous,
      settlements: previous.settlements.map((payment) =>
        payment.id === id &&
        payment.status === 'pending' &&
        payment.toId === currentUserId
          ? { ...payment, status }
          : payment,
      ),
    }));
  };
  return (
    <DemoContext.Provider
      value={{ state, addExpense, addGroup, recordPayment, respondToPayment }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error('DemoProvider is missing');
  return context;
}
