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
import { readPage, pageResult } from './pagination.js';
import {
  assertExpenseUnlocked,
  summarizeGroup,
  serializePayment,
  writeLedger,
} from './ledger.js';

export function expenseRouter(connection: Connection) {
  const router = Router();
  const { Group, Expense, Payment } = modelsFor(connection);
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
    locked: e.lockedByDeparture,
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
    const page = readPage(req.query);
    if (page.pending) throw new ApiError(400, 'Pending is a payment filter.');
    const rows = await Expense.find({
      groupId: id,
      deleted: false,
      ...page.filter,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(page.limit + 1);
    const result = pageResult(rows, page.limit);
    res.json({
      expenses: result.items.map(serialize),
      nextCursor: result.nextCursor,
    });
  });
  router.get('/expenses', async (req, res) => {
    const page = readPage(req.query);
    if (page.pending) throw new ApiError(400, 'Pending is a payment filter.');
    const groups = await Group.find({ memberIds: res.locals.user._id }).select(
      '_id',
    );
    const rows = await Expense.find({
      groupId: { $in: groups.map((g) => g._id) },
      deleted: false,
      ...page.filter,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(page.limit + 1);
    const result = pageResult(rows, page.limit);
    res.json({
      expenses: result.items.map(serialize),
      nextCursor: result.nextCursor,
    });
  });
  router.get('/payments', async (req, res) => {
    const page = readPage(req.query);
    const groups = await Group.find({ memberIds: res.locals.user._id }).select(
      '_id',
    );
    const conditions: Record<string, unknown>[] = [
      { groupId: { $in: groups.map((g) => g._id) } },
      page.filter,
    ];
    if (page.pending)
      conditions.push({
        status: 'pending',
        $or: [{ fromId: res.locals.user._id }, { toId: res.locals.user._id }],
      });
    const rows = await Payment.find({ $and: conditions })
      .sort({ createdAt: -1, _id: -1 })
      .limit(page.limit + 1);
    const result = pageResult(rows, page.limit);
    res.json({
      payments: result.items.map(serializePayment),
      nextCursor: result.nextCursor,
    });
  });
  router.post('/groups/:id/expenses', async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);
    const { requestId, expense } = createExpenseSchema.parse(req.body);
    // Canonicalize share order so a retry cannot create a second expense.
    expense.shares.sort((a, b) => a.userId.localeCompare(b.userId));
    const requestHash = createHash('sha256')
      .update(JSON.stringify(expense))
      .digest('hex');
    const key = { groupId: id, createdBy: res.locals.user._id, requestId };
    const now = new Date();
    const result = await writeLedger(
      connection,
      id,
      res.locals.user.id,
      async (session, group) => {
        const previous = await Expense.findOne(key).session(session);
        if (previous) {
          if (previous.requestHash !== requestHash)
            throw new ApiError(
              409,
              'This save was already used for different details. Open a new expense.',
            );
          return serialize(previous);
        }
        validate(expense, group.memberIds.map(String));
        const record = await Expense.findOneAndUpdate(
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
          { upsert: true, returnDocument: 'after', timestamps: false, session },
        );
        if (!record || record.requestHash !== requestHash)
          throw new ApiError(
            409,
            'This save was already used for different details. Open a new expense.',
          );
        return serialize(record);
      },
    );
    res.status(201).json({ expense: result });
  });
  router.get('/expenses/:id', async (req, res) => {
    const record = await Expense.findOne({
      _id: objectIdSchema.parse(req.params.id),
      deleted: false,
    });
    if (!record) throw new ApiError(404, 'Expense not found.');
    await member(record.groupId.toString(), res.locals.user.id);
    const locked =
      record.lockedByDeparture ||
      !!(await Payment.exists({
        expenseIds: record._id,
        status: { $in: ['pending', 'confirmed'] },
      }));
    res.json({ expense: { ...serialize(record), locked } });
  });
  router.patch('/expenses/:id', async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);
    const { expense, version } = updateExpenseSchema.parse(req.body);
    const record = await Expense.findOne({ _id: id, deleted: false });
    if (!record) throw new ApiError(404, 'Expense not found.');
    const result = await writeLedger(
      connection,
      record.groupId.toString(),
      res.locals.user.id,
      async (session, group) => {
        if (record.createdBy.toString() !== res.locals.user.id)
          throw new ApiError(
            403,
            'Only the person who added this expense can change it.',
          );
        validate(expense, group.memberIds.map(String));
        await assertExpenseUnlocked(connection, id, session);
        const updated = await Expense.findOneAndUpdate(
          { _id: id, version, deleted: false },
          { $set: expense, $inc: { version: 1 } },
          { returnDocument: 'after', session },
        );
        if (!updated)
          throw new ApiError(
            409,
            'This expense changed. Refresh before editing.',
          );
        return serialize(updated);
      },
    );
    res.json({ expense: result });
  });
  router.delete('/expenses/:id', async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);
    const { version } = z
      .object({ version: z.number().int().min(1) })
      .strict()
      .parse(req.body);
    const record = await Expense.findById(id);
    if (!record) throw new ApiError(404, 'Expense not found.');
    await writeLedger(
      connection,
      record.groupId.toString(),
      res.locals.user.id,
      async (session) => {
        if (record.createdBy.toString() !== res.locals.user.id)
          throw new ApiError(
            403,
            'Only the person who added this expense can delete it.',
          );
        if (record.deleted) {
          return;
        }
        await assertExpenseUnlocked(connection, id, session);
        const updated = await Expense.findOneAndUpdate(
          { _id: id, version, deleted: false },
          { $set: { deleted: true }, $inc: { version: 1 } },
          { session },
        );
        if (!updated)
          throw new ApiError(
            409,
            'This expense changed. Refresh before deleting.',
          );
      },
    );
    res.status(204).end();
  });
  router.get('/ledger', async (req, res) => {
    const { summary } = z
      .object({ summary: z.literal('1').optional() })
      .strict()
      .parse(req.query);
    const result = await connection.transaction(
      async (session) => {
        const groups = await Group.find({
          memberIds: res.locals.user._id,
        }).session(session);
        const groupIds = groups.map((group) => group._id);
        // Compatibility previews are bounded. Clients use /expenses and
        // /payments for complete history and /payments?pending=1 for the queue.
        const expenses = summary
          ? []
          : (
              await Expense.find({ groupId: { $in: groupIds }, deleted: false })
                .sort({ createdAt: -1, _id: -1 })
                .limit(20)
                .session(session)
            ).map(serialize);
        const payments = summary
          ? []
          : (
              await Payment.find({ groupId: { $in: groupIds } })
                .sort({ createdAt: -1, _id: -1 })
                .limit(20)
                .session(session)
            ).map(serializePayment);
        const balances = [];
        for (const group of groups) {
          const members = await summarizeGroup(connection, group, session);
          const users = await modelsFor(connection)
            .User.find({
              _id: { $in: [...group.memberIds, ...group.formerMemberIds] },
            })
            .select('name')
            .session(session);
          balances.push({
            groupId: group.id,
            groupName: group.name,
            members: members.map((m) => ({
              ...m,
              name: users.find((u) => u.id === m.userId)?.name ?? 'Member',
            })),
          });
        }
        return { expenses, payments, balances };
      },
      { readConcern: { level: 'snapshot' } },
    );
    res.json(result);
  });
  return router;
}
