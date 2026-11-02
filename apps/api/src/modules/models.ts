import { Schema, type Connection } from 'mongoose';

const userSchema = new Schema(
  {
    googleSub: { type: String, required: true, unique: true, select: false },
    email: { type: String, required: true },
    name: { type: String, required: true },
    upiId: { type: String, default: null },
  },
  { timestamps: true },
);
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);
const groupSchema = new Schema(
  {
    name: { type: String, required: true },
    kind: { type: String, enum: ['home', 'trip', 'friends'], required: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    memberIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      ref: 'User',
      index: true,
    },
    inviteHash: { type: String, select: false },
    inviteExpiresAt: Date,
    ledgerVersion: { type: Number, default: 0 },
    formerMemberIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    closedAt: Date,
  },
  { timestamps: true },
);
groupSchema.index({ inviteHash: 1 }, { unique: true, sparse: true });

const expenseSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    requestId: { type: String, required: true },
    requestHash: { type: String, required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    payerId: { type: Schema.Types.ObjectId, required: true },
    splitMode: { type: String, enum: ['equal', 'custom'], required: true },
    shares: [
      {
        _id: false,
        userId: { type: Schema.Types.ObjectId, required: true },
        amount: { type: Number, required: true },
      },
    ],
    version: { type: Number, default: 1 },
    deleted: { type: Boolean, default: false },
    lockedByDeparture: { type: Boolean, default: false },
  },
  { timestamps: true },
);
expenseSchema.index(
  { createdBy: 1, groupId: 1, requestId: 1 },
  { unique: true },
);
expenseSchema.index({ groupId: 1, deleted: 1, createdAt: -1, _id: -1 });

const paymentSchema = new Schema(
  {
    groupId: { type: Schema.Types.ObjectId, required: true, index: true },
    fromId: { type: Schema.Types.ObjectId, required: true },
    toId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true },
    requestId: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'rejected', 'cancelled'],
      default: 'pending',
      required: true,
    },
    expenseIds: [{ type: Schema.Types.ObjectId }],
  },
  { timestamps: true },
);
paymentSchema.index({ groupId: 1, fromId: 1, requestId: 1 }, { unique: true });
paymentSchema.index({ expenseIds: 1, status: 1 });
paymentSchema.index({ groupId: 1, createdAt: -1, _id: -1 });
paymentSchema.index({ groupId: 1, status: 1, createdAt: -1, _id: -1 });

export function modelsFor(connection: Connection) {
  return {
    User: connection.model('User', userSchema),
    Session: connection.model('Session', sessionSchema),
    Group: connection.model('Group', groupSchema),
    Expense: connection.model('Expense', expenseSchema),
    Payment: connection.model('Payment', paymentSchema),
  };
}
