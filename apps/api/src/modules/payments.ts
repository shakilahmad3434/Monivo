import { Router } from 'express';
import type { Connection } from 'mongoose';
import {
  createPaymentSchema,
  objectIdSchema,
  paymentActionSchema,
} from '@monivo/shared';
import { modelsFor } from './models.js';
import { ApiError } from './errors.js';
import { groupLedger, serializePayment, writeLedger } from './ledger.js';

export function paymentRouter(connection: Connection) {
  const router = Router();
  const { Payment } = modelsFor(connection);
  router.post('/groups/:id/payments', async (req, res) => {
    const groupId = objectIdSchema.parse(req.params.id);
    const input = createPaymentSchema.parse(req.body);
    const result = await writeLedger(
      connection,
      groupId,
      res.locals.user.id,
      async (session, group) => {
        const fromId = res.locals.user.id as string;
        const existing = await Payment.findOne({
          groupId,
          fromId,
          requestId: input.requestId,
        }).session(session);
        if (existing) {
          if (
            String(existing.toId) !== input.toId ||
            existing.amount !== input.amount
          )
            throw new ApiError(
              409,
              'This save ID was already used for a different payment.',
            );
          return serializePayment(existing);
        }
        if (
          input.toId === fromId ||
          !group.memberIds.some((id) => String(id) === input.toId)
        )
          throw new ApiError(400, 'Choose another member of this group.');
        const ledger = await groupLedger(connection, group, session);
        const sender = ledger.members.find((m) => m.userId === fromId)!;
        const recipient = ledger.members.find((m) => m.userId === input.toId)!;
        const maximum = Math.min(
          sender.availableToPay,
          recipient.availableToReceive,
        );
        if (input.amount > maximum)
          throw new ApiError(
            409,
            'This amount exceeds the available balance. Refresh balances; pending payments already reserve their amounts.',
          );
        const [payment] = await Payment.create(
          [
            {
              groupId,
              fromId,
              toId: input.toId,
              amount: input.amount,
              requestId: input.requestId,
              status: 'pending',
              expenseIds: ledger.expenses.map((e) => e._id),
            },
          ],
          { session },
        );
        return serializePayment(payment!);
      },
    );
    res.status(201).json({ payment: result });
  });
  router.post('/payments/:id/respond', async (req, res) => {
    const id = objectIdSchema.parse(req.params.id);
    const { action } = paymentActionSchema.parse(req.body);
    const record = await Payment.findById(id);
    if (!record) throw new ApiError(404, 'Payment not found.');
    const result = await writeLedger(
      connection,
      String(record.groupId),
      res.locals.user.id,
      async (session) => {
        const payment = await Payment.findById(id).session(session);
        if (!payment) throw new ApiError(404, 'Payment not found.');
        const actor = action === 'cancel' ? payment.fromId : payment.toId;
        if (String(actor) !== res.locals.user.id)
          throw new ApiError(
            403,
            action === 'cancel'
              ? 'Only the sender can cancel this payment.'
              : 'Only the recipient can confirm or reject this payment.',
          );
        const target =
          action === 'confirm'
            ? 'confirmed'
            : action === 'reject'
              ? 'rejected'
              : 'cancelled';
        if (payment.status === target) return serializePayment(payment);
        if (payment.status !== 'pending')
          throw new ApiError(
            409,
            'This payment has already been resolved. Refresh to see its status.',
          );
        payment.status = target;
        await payment.save({ session });
        return serializePayment(payment);
      },
    );
    res.json({ payment: result });
  });
  return router;
}
