import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\/\S+$/),
  GOOGLE_WEB_CLIENT_ID: z
    .string()
    .regex(/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/)
    .optional(),
  SESSION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
});

export function parseEnvironment(environment: NodeJS.ProcessEnv) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join('.'));
    throw new Error(
      `Invalid environment variables: ${[...new Set(keys)].join(', ')}`,
    );
  }
  return result.data;
}
