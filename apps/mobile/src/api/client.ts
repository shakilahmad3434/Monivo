import type { ZodType } from 'zod';
import { reportSessionExpiry } from './session-events';

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
  options: {
    token?: string;
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  if (!apiUrl || !/^https?:\/\//.test(apiUrl))
    throw new Error('Set EXPO_PUBLIC_API_URL to connect to Monivo.');
  if (process.env.NODE_ENV === 'production' && !apiUrl.startsWith('https://'))
    throw new Error('Release builds require an HTTPS API URL.');
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (options.signal?.aborted) cancel();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 12000);
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
    const data: unknown = await response.json().catch(() => null);
    if (controller.signal.aborted)
      throw Object.assign(new Error('Request aborted'), { name: 'AbortError' });
    if (response.status === 401 && options.token)
      reportSessionExpiry(options.token);
    if (!response.ok)
      throw new ApiError(
        response.status,
        response.status === 401
          ? 'Your session has expired. Please sign in again.'
          : typeof data === 'object' &&
              data !== null &&
              'error' in data &&
              typeof data.error === 'string'
            ? data.error
            : response.status >= 500
              ? 'Monivo is temporarily unavailable. Please try again.'
              : response.status === 429
                ? 'Too many requests. Wait a moment, then try again.'
                : 'The request could not be completed.',
      );
    if (!schema) return undefined as T;
    const parsed = schema.safeParse(data);
    if (!parsed.success)
      throw new Error(
        'Monivo returned an unexpected response. Refresh the app and try again.',
      );
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.signal?.aborted) throw error;
    if (timedOut)
      throw new Error(
        'The server took too long. Check your connection and try again.',
        { cause: error },
      );
    if (error instanceof TypeError)
      throw new Error(
        'Could not reach Monivo. Check your connection and try again.',
        { cause: error },
      );
    throw error;
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', cancel);
  }
}
