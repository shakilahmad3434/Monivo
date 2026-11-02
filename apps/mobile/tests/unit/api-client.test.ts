import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

describe('API failure handling', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://localhost:3000');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  it('handles non-JSON upstream errors and malformed successful responses', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<html>Bad gateway</html>', { status: 502 }),
      )
      .mockResolvedValueOnce(new Response('invalid json', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const { apiRequest } = await import('../../src/api/client');
    await expect(
      apiRequest('/me', z.object({ user: z.string() })),
    ).rejects.toThrow('temporarily unavailable');
    await expect(
      apiRequest('/me', z.object({ user: z.string() })),
    ).rejects.toThrow('unexpected response');
  });
  it('reports only the rejected bearer token on expiry and supports unsubscribing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('<html>Unauthorized</html>', { status: 401 }),
      ),
    );
    const { apiRequest } = await import('../../src/api/client');
    const { subscribeSessionExpiry } =
      await import('../../src/api/session-events');
    const listener = vi.fn();
    const unsubscribe = subscribeSessionExpiry(listener);
    await expect(
      apiRequest('/me', null, { token: 'old' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledExactlyOnceWith('old');
    unsubscribe();
    await expect(apiRequest('/me', null, { token: 'new' })).rejects.toThrow(
      'session has expired',
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('turns network failures into actionable messages and accepts empty 204 responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );
    const { apiRequest } = await import('../../src/api/client');
    await expect(apiRequest('/me', null)).rejects.toThrow(
      'Check your connection',
    );
    await expect(
      apiRequest('/auth/logout', null, { method: 'POST' }),
    ).resolves.toBeUndefined();
  });
  it('distinguishes an actual timeout from caller cancellation', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            const abort = () =>
              reject(new DOMException('Aborted', 'AbortError'));
            if (init.signal?.aborted) abort();
            else init.signal?.addEventListener('abort', abort, { once: true });
          }),
      ),
    );
    const { apiRequest } = await import('../../src/api/client');
    const timed = expect(apiRequest('/me', null)).rejects.toThrow(
      'server took too long',
    );
    await vi.advanceTimersByTimeAsync(12001);
    await timed;
    const controller = new AbortController();
    const cancelled = expect(
      apiRequest('/me', null, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await cancelled;
  });
});
