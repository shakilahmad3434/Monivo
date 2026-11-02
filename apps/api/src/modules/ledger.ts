import type { ClientSession, Connection } from 'mongoose';
import { modelsFor } from './models.js';
import { ApiError } from './errors.js';

// All financial writes touch the group first. MongoDB retries conflicting
// transactions, so payment reservations and expense changes see a consistent ledger.
export async function writeLedger<T>(
  connection: Connection,
  groupId: string,
  userId: string,
  work: (
    session: ClientSession,
    group: InstanceType<ReturnType<typeof modelsFor>['Group']>,
  ) => Promise<T>,
) {
  return connection.transaction(
    async (session) => {
      const group = await modelsFor(connection).Group.findOneAndUpdate(
        { _id: groupId, memberIds: userId },
        { $inc: { ledgerVersion: 1 } },
        { session, returnDocument: 'after', timestamps: false },
      );
      if (!group) throw new ApiError(404, 'Group not found.');
      return work(session, group);
    },
    { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
  );
}

export async function groupLedger(
  connection: Connection,
  group: InstanceType<ReturnType<typeof modelsFor>['Group']>,
  session: ClientSession,
) {
  const { Expense, Payment } = modelsFor(connection);
  const expenses = await Expense.find({
    groupId: group._id,
    deleted: false,
  }).session(session);
  const payments = await Payment.find({ groupId: group._id })
    .sort({ updatedAt: -1, _id: -1 })
    .session(session);
  const totals: Record<string, number> = Object.fromEntries(
    group.memberIds.map((id) => [String(id), 0]),
  );
  for (const e of expenses) {
    totals[String(e.payerId)] = (totals[String(e.payerId)] ?? 0) + e.amount;
    for (const s of e.shares)
      totals[String(s.userId)] = (totals[String(s.userId)] ?? 0) - s.amount;
  }
  for (const p of payments.filter((p) => p.status === 'confirmed')) {
    totals[String(p.fromId)] = (totals[String(p.fromId)] ?? 0) + p.amount;
    totals[String(p.toId)] = (totals[String(p.toId)] ?? 0) - p.amount;
  }
  const members = Object.entries(totals).map(([userId, amount]) => {
    const outgoing = payments
      .filter((p) => p.status === 'pending' && String(p.fromId) === userId)
      .reduce((sum, p) => sum + p.amount, 0);
    const incoming = payments
      .filter((p) => p.status === 'pending' && String(p.toId) === userId)
      .reduce((sum, p) => sum + p.amount, 0);
    return {
      userId,
      amount,
      availableToPay: Math.max(0, -amount - outgoing),
      availableToReceive: Math.max(0, amount - incoming),
    };
  });
  return { expenses, payments, members };
}

export const serializePayment = (
  p: InstanceType<ReturnType<typeof modelsFor>['Payment']>,
) => ({
  id: p.id,
  groupId: String(p.groupId),
  fromId: String(p.fromId),
  toId: String(p.toId),
  amount: p.amount,
  status: p.status,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

export async function assertExpenseUnlocked(
  connection: Connection,
  id: string,
  session: ClientSession,
) {
  if (
    await modelsFor(connection)
      .Expense.exists({ _id: id, lockedByDeparture: true })
      .session(session)
  )
    throw new ApiError(
      409,
      'This expense is protected because a member left the group. Add a correction expense instead.',
    );
  if (
    await modelsFor(connection)
      .Payment.exists({
        expenseIds: id,
        status: { $in: ['pending', 'confirmed'] },
      })
      .session(session)
  )
    throw new ApiError(
      409,
      'This expense is covered by a pending or confirmed payment. Add a correction expense instead.',
    );
}
