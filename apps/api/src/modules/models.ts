import { Schema, type Connection } from 'mongoose';

const userSchema = new Schema(
  {
    googleSub: { type: String, required: true, unique: true, select: false },
    email: { type: String, required: true },
    name: { type: String, required: true },
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
  },
  { timestamps: true },
);
groupSchema.index({ inviteHash: 1 }, { unique: true, sparse: true });

export function modelsFor(connection: Connection) {
  return {
    User: connection.model('User', userSchema),
    Session: connection.model('Session', sessionSchema),
    Group: connection.model('Group', groupSchema),
  };
}
