import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  service: z.literal('monivo-api'),
  database: z.enum(['connected', 'disconnected']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const inviteTokenSchema = z.string().regex(/^[a-f\d]{64}$/);
// Format validation only; ownership/existence must be checked in the payment app.
export const upiIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(100)
  .regex(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/)
  .transform((value) => value.toLowerCase());
export const profileSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  email: z.email(),
  upiId: upiIdSchema.nullable().default(null),
});
export const memberSchema = profileSchema.omit({ email: true, upiId: true });
export const groupSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  kind: z.enum(['home', 'trip', 'friends']),
  ownerId: objectIdSchema,
  members: z.array(memberSchema),
  formerMembers: z.array(memberSchema).default([]),
});
export const createGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    kind: z.enum(['home', 'trip', 'friends']).default('friends'),
  })
  .strict();
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    upiId: upiIdSchema.nullable().optional(),
  })
  .strict();
export const googleLoginSchema = z
  .object({ idToken: z.string().min(1).max(10000) })
  .strict();
export const sessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.iso.datetime(),
  user: profileSchema,
});
export const inviteResponseSchema = z.object({
  token: inviteTokenSchema,
  expiresAt: z.iso.datetime(),
});
export const invitePreviewSchema = z.object({
  groupName: z.string(),
  memberCount: z.number().int(),
  expiresAt: z.iso.datetime(),
});
export type Profile = z.infer<typeof profileSchema>;
export type LiveGroup = z.infer<typeof groupSchema>;
export type CreateGroupInput = z.input<typeof createGroupSchema>;
export const renameGroupSchema = createGroupSchema.pick({ name: true });
export const transferGroupSchema = z
  .object({ newOwnerId: objectIdSchema })
  .strict();

// Money crosses the API boundary as integer paise, never floating point rupees.
export const paiseSchema = z.number().int().min(1).max(100_000_000);
export const expenseInputSchema = z
  .object({
    description: z.string().trim().min(1).max(80),
    amount: paiseSchema,
    payerId: objectIdSchema,
    splitMode: z.enum(['equal', 'custom']),
    shares: z
      .array(
        z
          .object({
            userId: objectIdSchema,
            amount: z.number().int().min(0).max(100_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.shares.map((s) => s.userId)).size !== value.shares.length ||
      value.shares.reduce((sum, s) => sum + s.amount, 0) !== value.amount
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Unique shares must add up to the expense.',
      });
  });
export const createExpenseSchema = z
  .object({ requestId: z.uuid(), expense: expenseInputSchema })
  .strict();
export const updateExpenseSchema = z
  .object({ version: z.number().int().min(1), expense: expenseInputSchema })
  .strict();
export const expenseSchema = z.object({
  id: objectIdSchema,
  groupId: objectIdSchema,
  createdBy: objectIdSchema,
  description: z.string(),
  amount: paiseSchema,
  payerId: objectIdSchema,
  splitMode: z.enum(['equal', 'custom']),
  shares: z.array(
    z.object({ userId: objectIdSchema, amount: z.number().int().min(0) }),
  ),
  version: z.number().int(),
  deleted: z.boolean(),
  locked: z.boolean().default(false),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type LiveExpense = z.infer<typeof expenseSchema>;
export function splitEqually(amount: number, ids: string[]) {
  const sorted = [...ids].sort();
  return sorted.map((userId, index) => ({
    userId,
    amount:
      Math.floor(amount / sorted.length) +
      (index < amount % sorted.length ? 1 : 0),
  }));
}

export const createPaymentSchema = z
  .object({
    requestId: z.uuid(),
    toId: objectIdSchema,
    amount: paiseSchema,
  })
  .strict();
export const paymentActionSchema = z
  .object({ action: z.enum(['confirm', 'reject', 'cancel']) })
  .strict();
export const paymentSchema = z.object({
  id: objectIdSchema,
  groupId: objectIdSchema,
  fromId: objectIdSchema,
  toId: objectIdSchema,
  amount: paiseSchema,
  status: z.enum(['pending', 'confirmed', 'rejected', 'cancelled']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type LivePayment = z.infer<typeof paymentSchema>;

export const paymentRecipientSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  upiId: upiIdSchema.nullable(),
});
