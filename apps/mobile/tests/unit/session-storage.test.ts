import { describe, expect, it } from 'vitest';
import { createSessionStorage } from '../../src/lib/session-storage';

describe('Session storage races', () => {
  it('does not let a stale logout/expiry remove a newer login', async () => {
    let token: string | null = 'old';
    const storage = createSessionStorage({
      getItemAsync: async () => token,
      setItemAsync: async (_key, next) => {
        await Promise.resolve();
        token = next;
      },
      deleteItemAsync: async () => {
        token = null;
      },
    });
    await Promise.all([storage.set('new'), storage.clearIf('old')]);
    expect(await storage.get()).toBe('new');
    await Promise.all([storage.clearIf('new'), storage.set('newer')]);
    expect(await storage.get()).toBe('newer');
  });
  it('recovers the operation queue after a storage failure', async () => {
    let token: string | null = 'old';
    let fail = true;
    const storage = createSessionStorage({
      getItemAsync: async () => token,
      setItemAsync: async (_key, next) => {
        if (fail) {
          fail = false;
          throw new Error('storage unavailable');
        }
        token = next;
      },
      deleteItemAsync: async () => {
        token = null;
      },
    });
    await expect(storage.set('failed')).rejects.toThrow('storage unavailable');
    await storage.set('new');
    expect(await storage.get()).toBe('new');
  });
});
