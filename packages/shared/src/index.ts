import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  service: z.literal('monivo-api'),
  database: z.enum(['connected', 'disconnected']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const inviteTokenSchema = z.string().regex(/^[a-f\d]{64}$/);
export const profileSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  email: z.email(),
});
export const memberSchema = profileSchema.omit({ email: true });
export const groupSchema = z.object({
  id: objectIdSchema,
  name: z.string(),
  kind: z.enum(['home', 'trip', 'friends']),
  ownerId: objectIdSchema,
  members: z.array(memberSchema),
});
export const createGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    kind: z.enum(['home', 'trip', 'friends']).default('friends'),
  })
  .strict();
export const updateProfileSchema = z
  .object({ name: z.string().trim().min(1).max(50) })
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
