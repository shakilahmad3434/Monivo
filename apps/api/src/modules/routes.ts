import { createHash, randomBytes } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import type { Connection, Types } from 'mongoose';
import {
  createGroupSchema,
  googleLoginSchema,
  inviteTokenSchema,
  objectIdSchema,
  updateProfileSchema,
  renameGroupSchema,
  transferGroupSchema,
} from '@monivo/shared';
import { modelsFor } from './models.js';
import { ApiError } from './errors.js';
import { googleVerifier, type VerifyGoogleToken } from './google.js';
import { expenseRouter } from './expenses.js';
import { paymentRouter } from './payments.js';
import { groupLedger, writeLedger } from './ledger.js';

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export type ApiOptions = {
  connection: Connection;
  googleClientId?: string;
  verifyGoogleToken?: VerifyGoogleToken;
  sessionDays?: number;
};

export function createApiRouter(options: ApiOptions) {
  const router = Router();
  const { User, Session, Group } = modelsFor(options.connection);
  const verify =
    options.verifyGoogleToken ?? googleVerifier(options.googleClientId);
  const profile = (user: {
    _id: Types.ObjectId;
    name: string;
    email: string;
    upiId?: string | null;
  }) => ({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    upiId: user.upiId ?? null,
  });
  const requireAuth: RequestHandler = async (request, response, next) => {
    const match = /^Bearer ([a-f\d]{64})$/.exec(
      request.headers.authorization ?? '',
    );
    if (!match?.[1]) throw new ApiError(401, 'Sign in to continue.');
    const session = await Session.findOne({
      tokenHash: hash(match[1]),
      expiresAt: { $gt: new Date() },
    });
    if (!session)
      throw new ApiError(
        401,
        'Your session has expired. Please sign in again.',
      );
    const user = await User.findById(session.userId);
    if (!user) throw new ApiError(401, 'Sign in to continue.');
    response.locals.user = user;
    response.locals.sessionId = session._id;
    next();
  };
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please try again later.' },
  });
  router.post('/auth/google', loginLimit, async (request, response) => {
    const { idToken } = googleLoginSchema.parse(request.body);
    const identity = await verify(idToken);
    const user = await User.findOneAndUpdate(
      { googleSub: identity.sub },
      {
        $set: { email: identity.email },
        $setOnInsert: { name: identity.name },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    );
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + (options.sessionDays ?? 7) * 86400000,
    );
    await Session.create({
      tokenHash: hash(token),
      userId: user._id,
      expiresAt,
    });
    response
      .set('Cache-Control', 'no-store')
      .json({ token, expiresAt: expiresAt.toISOString(), user: profile(user) });
  });
  router.use(requireAuth);
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.post('/auth/logout', async (_request, response) => {
    await Session.deleteOne({ _id: response.locals.sessionId });
    response.status(204).end();
  });
  router.get('/me', (_request, response) =>
    response.json({ user: profile(response.locals.user) }),
  );
  router.patch('/me', async (request, response) => {
    const input = updateProfileSchema.parse(request.body);
    const user = await User.findByIdAndUpdate(response.locals.user._id, input, {
      returnDocument: 'after',
      runValidators: true,
    });
    if (!user) throw new ApiError(401, 'Sign in to continue.');
    response.json({ user: profile(user) });
  });

  async function serializeGroup(group: {
    _id: Types.ObjectId;
    name: string;
    kind: string;
    ownerId: Types.ObjectId;
    memberIds: Types.ObjectId[];
    formerMemberIds: Types.ObjectId[];
  }) {
    const members = await User.find({ _id: { $in: group.memberIds } })
      .select('name')
      .lean();
    const former = await User.find({ _id: { $in: group.formerMemberIds } })
      .select('name')
      .lean();
    return {
      id: group._id.toString(),
      name: group.name,
      kind: group.kind,
      ownerId: group.ownerId.toString(),
      members: members.map((member) => ({
        id: member._id.toString(),
        name: member.name,
      })),
      formerMembers: former
        .filter(
          (member) => !group.memberIds.some((id) => id.equals(member._id)),
        )
        .map((member) => ({ id: member._id.toString(), name: member.name })),
    };
  }
  router.get('/groups', async (_request, response) => {
    const groups = await Group.find({
      memberIds: response.locals.user._id,
    }).sort({ createdAt: -1 });
    response.json({ groups: await Promise.all(groups.map(serializeGroup)) });
  });
  router.post('/groups', async (request, response) => {
    const input = createGroupSchema.parse(request.body);
    const ownerId = response.locals.user._id;
    const group = await Group.create({
      ...input,
      ownerId,
      memberIds: [ownerId],
    });
    response.status(201).json({ group: await serializeGroup(group) });
  });
  router.get('/groups/:id', async (request, response) => {
    const id = objectIdSchema.parse(request.params.id);
    const group = await Group.findOne({
      _id: id,
      memberIds: response.locals.user._id,
    });
    if (!group) throw new ApiError(404, 'Group not found.');
    response.json({ group: await serializeGroup(group) });
  });
  router.patch('/groups/:id', async (request, response) => {
    const id = objectIdSchema.parse(request.params.id);
    const input = renameGroupSchema.parse(request.body);
    await writeLedger(
      options.connection,
      id,
      response.locals.user.id,
      async (session, group) => {
        if (group.ownerId.toString() !== response.locals.user.id)
          throw new ApiError(403, 'Only the group owner can rename it.');
        group.name = input.name;
        await group.save({ session });
      },
    );
    response.status(204).end();
  });
  router.post('/groups/:id/owner', async (request, response) => {
    const id = objectIdSchema.parse(request.params.id);
    const { newOwnerId } = transferGroupSchema.parse(request.body);
    await writeLedger(
      options.connection,
      id,
      response.locals.user.id,
      async (session, group) => {
        if (group.ownerId.toString() !== response.locals.user.id)
          throw new ApiError(
            403,
            'Only the group owner can transfer ownership.',
          );
        if (
          newOwnerId === response.locals.user.id ||
          !group.memberIds.some((id) => id.toString() === newOwnerId)
        )
          throw new ApiError(400, 'Choose another current member.');
        group.ownerId = group.memberIds.find(
          (id) => id.toString() === newOwnerId,
        )!;
        group.inviteHash = undefined;
        group.inviteExpiresAt = undefined;
        await group.save({ session });
      },
    );
    response.status(204).end();
  });
  router.post('/groups/:id/leave', async (request, response) => {
    const id = objectIdSchema.parse(request.params.id);
    try {
      await writeLedger(
        options.connection,
        id,
        response.locals.user.id,
        async (session, group) => {
          const userId = response.locals.user.id as string;
          if (group.ownerId.toString() === userId && group.memberIds.length > 1)
            throw new ApiError(
              409,
              'Transfer ownership to another member before leaving.',
            );
          const ledger = await groupLedger(options.connection, group, session);
          if (ledger.members.find((m) => m.userId === userId)?.amount !== 0)
            throw new ApiError(
              409,
              'Settle your balance before leaving. Both money owed and money due must be zero.',
            );
          if (
            ledger.payments.some(
              (p) =>
                p.status === 'pending' &&
                (p.fromId.toString() === userId ||
                  p.toId.toString() === userId),
            )
          )
            throw new ApiError(
              409,
              'Resolve your pending payments before leaving.',
            );
          // Freeze history that could otherwise recreate a departed member's balance.
          await modelsFor(options.connection).Expense.updateMany(
            {
              groupId: id,
              deleted: false,
              $or: [
                { payerId: userId },
                { shares: { $elemMatch: { userId, amount: { $gt: 0 } } } },
              ],
            },
            { $set: { lockedByDeparture: true } },
            { session, timestamps: false },
          );
          if (
            !group.formerMemberIds.some(
              (member) => member.toString() === userId,
            )
          )
            group.formerMemberIds.push(response.locals.user._id);
          group.memberIds = group.memberIds.filter(
            (member) => member.toString() !== userId,
          );
          // Revoke the departing member's previously shared links. Remaining owners
          // can issue a fresh invite; an empty group is permanently closed.
          group.inviteHash = undefined;
          group.inviteExpiresAt = undefined;
          if (group.memberIds.length === 0) group.closedAt = new Date();
          await group.save({ session });
        },
      );
    } catch (error) {
      // A successful departure may have lost its HTTP response. A retry by
      // that former member is safe; outsiders still receive 404.
      if (!(
        error instanceof ApiError &&
        error.status === 404 &&
        (await Group.exists({
          _id: id,
          formerMemberIds: response.locals.user._id,
          memberIds: { $ne: response.locals.user._id },
        }))
      ))
        throw error;
    }
    response.status(204).end();
  });
  router.get(
    '/groups/:id/payment-recipient/:userId',
    async (request, response) => {
      const id = objectIdSchema.parse(request.params.id);
      const userId = objectIdSchema.parse(request.params.userId);
      const group = await Group.findOne({
        _id: id,
        memberIds: { $all: [response.locals.user._id, userId] },
      });
      if (!group) throw new ApiError(404, 'Group member not found.');
      const recipient = await User.findById(userId).select('name upiId');
      if (!recipient) throw new ApiError(404, 'Group member not found.');
      response.json({
        recipient: {
          id: recipient.id,
          name: recipient.name,
          upiId: recipient.upiId ?? null,
        },
      });
    },
  );
  router.post('/groups/:id/invite', async (request, response) => {
    const id = objectIdSchema.parse(request.params.id);
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    const group = await Group.findOneAndUpdate(
      {
        _id: id,
        ownerId: response.locals.user._id,
        memberIds: response.locals.user._id,
      },
      { $set: { inviteHash: hash(token), inviteExpiresAt: expiresAt } },
    );
    if (!group)
      throw new ApiError(
        404,
        'Group not found or invite permission unavailable.',
      );
    response.status(201).json({ token, expiresAt: expiresAt.toISOString() });
  });
  router.delete('/groups/:id/invite', async (request, response) => {
    const id = objectIdSchema.parse(request.params.id);
    const group = await Group.findOneAndUpdate(
      {
        _id: id,
        ownerId: response.locals.user._id,
        memberIds: response.locals.user._id,
      },
      { $unset: { inviteHash: '', inviteExpiresAt: '' } },
    );
    if (!group)
      throw new ApiError(
        404,
        'Group not found or invite permission unavailable.',
      );
    response.status(204).end();
  });
  router.get('/invitations/:token', async (request, response) => {
    const token = inviteTokenSchema.parse(request.params.token);
    const group = await Group.findOne({
      inviteHash: hash(token),
      inviteExpiresAt: { $gt: new Date() },
      closedAt: { $exists: false },
    });
    if (!group)
      throw new ApiError(404, 'This invitation has expired or been revoked.');
    response.json({
      groupName: group.name,
      memberCount: group.memberIds.length,
      expiresAt: group.inviteExpiresAt?.toISOString(),
    });
  });
  router.post('/invitations/:token/join', async (request, response) => {
    const token = inviteTokenSchema.parse(request.params.token);
    const group = await Group.findOneAndUpdate(
      {
        inviteHash: hash(token),
        inviteExpiresAt: { $gt: new Date() },
        closedAt: { $exists: false },
      },
      { $addToSet: { memberIds: response.locals.user._id } },
      { returnDocument: 'after' },
    );
    if (!group)
      throw new ApiError(404, 'This invitation has expired or been revoked.');
    response.json({ group: await serializeGroup(group) });
  });
  router.use(expenseRouter(options.connection));
  router.use(paymentRouter(options.connection));
  return router;
}
