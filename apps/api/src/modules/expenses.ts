import { Router } from 'express';
import { createHash } from 'node:crypto';
import type { Connection } from 'mongoose';
import { z } from 'zod';
import {
  createExpenseSchema,
  updateExpenseSchema,
  objectIdSchema,
  splitEqually,
  type ExpenseInput,
} from '@monivo/shared';
import { modelsFor } from './models.js';
import { ApiError } from './errors.js';

export function expenseRouter(connection: Connection) {
  const router = Router();
  const { Group, Expense } = modelsFor(connection);
  const serialize = (e: InstanceType<typeof Expense>) => ({
    id: e._id.toString(),
    groupId: e.groupId.toString(),
    createdBy: e.createdBy.toString(),
    description: e.description,
    amount: e.amount,
    payerId: e.payerId.toString(),
    splitMode: e.splitMode,
    shares: e.shares.map((s) => ({
      userId: s.userId.toString(),
      amount: s.amount,
    })),
    version: e.version,
    deleted: e.deleted,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  });
  async function member(groupId: string, userId: string) {
    const group = await Group.findOne({ _id: groupId, memberIds: userId });
    if (!group) throw new ApiError(404, 'Group not found.');
    return group;
  }
  function validate(input: ExpenseInput, members: string[]) {
    if (
      ![input.payerId, ...input.shares.map((s) => s.userId)].every((id) =>
        members.includes(id),
      )
    )
      throw new ApiError(
        400,
        'Choose the payer and participants from this group.',
      );
    if (input.splitMode === 'equal') {
      const expected = splitEqually(
        input.amount,
        input.shares.map((s) => s.userId),
      );
      if (
        expected.some(
          (s) =>
            input.shares.find((v) => v.userId === s.userId)?.amount !==
            s.amount,
        )
      )
        throw new ApiError(400, 'Equal shares do not match the expense total.');
    }
  }
  router.get('/groups/:id/expenses', async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);
    await member(id, res.locals.user.id);
    const expenses = await Expense.find({ groupId: id, deleted: false }).sort({
      createdAt: -1,
      _id: -1,
    });
    res.json({ expenses: expenses.map(serialize) });
  });
  router.post('/groups/:id/expenses', async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);
    const group = await member(id, res.locals.user.id);
    const { requestId, expense } = createExpenseSchema.parse(req.body);
    validate(expense, group.memberIds.map(String));
    // Canonicalize share order so a retry cannot create a second expense.
    expense.shares.sort((a, b) => a.userId.localeCompare(b.userId));
    const requestHash = createHash('sha256')
      .update(JSON.stringify(expense))
      .digest('hex');
    const key = { groupId: id, createdBy: res.locals.user._id, requestId };
    const now = new Date();
    let record;
    try {
      record = await Expense.findOneAndUpdate(
        key,
        {
          $setOnInsert: {
            ...key,
            ...expense,
            requestHash,
            version: 1,
            deleted: false,
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true, returnDocument: 'after', timestamps: false },
      );
    } catch (error) {
      if (!(
        typeof error === 'object' &&
        error &&
        'code' in error &&
        error.code === 11000
      ))
        throw error;
      record = await Expense.findOne(key);
    }
    if (!record || record.requestHash !== requestHash)
      throw new ApiError(
        409,
        'This save was already used for different details. Open a new expense.',
      );
    res.status(201).json({ expense: serialize(record) });
  });
  router.get('/expenses/:id', async (req, res) => {
    const record = await Expense.findOne({
      _id: objectIdSchema.parse(req.params.id),
      deleted: false,
    });
    if (!record) throw new ApiError(404, 'Expense not found.');
    await member(record.groupId.toString(), res.locals.user.id);
    res.json({ expense: serialize(record) });
  });
  router.patch('/expenses/:id', async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);
    const { expense, version } = updateExpenseSchema.parse(req.body);
    const record = await Expense.findOne({ _id: id, deleted: false });
    if (!record) throw new ApiError(404, 'Expense not found.');
    const group = await member(record.groupId.toString(), res.locals.user.id);
    if (record.createdBy.toString() !== res.locals.user.id)
      throw new ApiError(
        403,
        'Only the person who added this expense can change it.',
      );
    validate(expense, group.memberIds.map(String));
    const updated = await Expense.findOneAndUpdate(
      { _id: id, version, deleted: false },
      { $set: expense, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated)
      throw new ApiError(409, 'This expense changed. Refresh before editing.');
    res.json({ expense: serialize(updated) });
  });
  router.delete('/expenses/:id', async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);
    const { version } = z
      .object({ version: z.number().int().min(1) })
      .strict()
      .parse(req.body);
    const record = await Expense.findById(id);
    if (!record) throw new ApiError(404, 'Expense not found.');
    await member(record.groupId.toString(), res.locals.user.id);
    if (record.createdBy.toString() !== res.locals.user.id)
      throw new ApiError(
        403,
        'Only the person who added this expense can delete it.',
      );
    if (record.deleted) {
      res.status(204).end();
      return;
    }
    const updated = await Expense.findOneAndUpdate(
      { _id: id, version, deleted: false },
      { $set: { deleted: true }, $inc: { version: 1 } },
    );
    if (!updated)
      throw new ApiError(409, 'This expense changed. Refresh before deleting.');
    res.status(204).end();
  });
  router.get('/ledger', async (_req, res) => {
    const groups = await Group.find({ memberIds: res.locals.user._id });
    const expenses = await Expense.find({
      groupId: { $in: groups.map((g) => g._id) },
      deleted: false,
    }).sort({ updatedAt: -1, _id: -1 });
    const balances = groups.map((group) => {
      const totals: Record<string, number> = Object.fromEntries(
        group.memberIds.map((id) => [id.toString(), 0]),
      );
      for (const e of expenses.filter((e) => e.groupId.equals(group._id))) {
        const payer = e.payerId.toString();
        totals[payer] = (totals[payer] ?? 0) + e.amount;
        for (const share of e.shares) {
          const id = share.userId.toString();
          totals[id] = (totals[id] ?? 0) - share.amount;
        }
      }
      return {
        groupId: group.id,
        groupName: group.name,
        members: Object.entries(totals).map(([userId, amount]) => ({
          userId,
          amount,
        })),
      };
    });
    res.json({ expenses: expenses.map(serialize), balances });
  });
  return router;
}
