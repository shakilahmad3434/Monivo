import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  service: z.literal('monivo-api'),
  database: z.enum(['connected', 'disconnected']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
