import { Types } from 'mongoose';
import { z } from 'zod';
import { ApiError } from './errors.js';

const cursorSchema = z
  .object({ at: z.iso.datetime(), id: z.string().regex(/^[a-f\d]{24}$/) })
  .strict();
export function readPage(query: unknown) {
  const input = z
    .object({
      limit: z.coerce.number().int().min(1).max(50).default(20),
      cursor: z
        .string()
        .min(1)
        .max(300)
        .regex(/^[A-Za-z0-9_-]+$/)
        .optional(),
      pending: z.literal('1').optional(),
    })
    .strict()
    .parse(query);
  let position: z.infer<typeof cursorSchema> | undefined;
  if (input.cursor) {
    try {
      position = cursorSchema.parse(
        JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')),
      );
    } catch {
      throw new ApiError(400, 'Invalid page cursor. Refresh the list.');
    }
  }
  const filter = position
    ? {
        $or: [
          { createdAt: { $lt: new Date(position.at) } },
          {
            createdAt: new Date(position.at),
            _id: { $lt: new Types.ObjectId(position.id) },
          },
        ],
      }
    : {};
  return { ...input, filter };
}
export function pageResult<T extends { _id: Types.ObjectId; createdAt: Date }>(
  rows: T[],
  limit: number,
) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({
              at: last.createdAt.toISOString(),
              id: String(last._id),
            }),
          ).toString('base64url')
        : null,
  };
}
