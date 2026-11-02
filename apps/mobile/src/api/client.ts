import type { ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
export async function apiRequest<T>(
  path: string,
  schema: ZodType<T> | null,
  options: { token?: string; method?: string; body?: unknown } = {},
): Promise<T> {
  if (!apiUrl || !/^https?:\/\//.test(apiUrl))
    throw new Error('Set EXPO_PUBLIC_API_URL to connect to Monivo.');
  if (process.env.NODE_ENV === 'production' && !apiUrl.startsWith('https://'))
    throw new Error('Release builds require an HTTPS API URL.');
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${apiUrl}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    if (response.status === 204) return undefined as T;
    const data: unknown = await response.json();
    if (!response.ok)
      throw new ApiError(
        response.status,
        typeof data === 'object' &&
          data !== null &&
          'error' in data &&
          typeof data.error === 'string'
          ? data.error
          : 'The request could not be completed.',
      );
    if (!schema) return undefined as T;
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error(
        'The server took too long. Check your connection and try again.',
        { cause: error },
      );
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}
