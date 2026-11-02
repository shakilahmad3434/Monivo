type Adapter = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};
// Serialize storage changes so a delayed expiry/logout cannot erase a newer login.
export function createSessionStorage(adapter: Adapter, key = 'monivo-session') {
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(work: () => Promise<T>) => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };
  return {
    get: () => run(() => adapter.getItemAsync(key)),
    set: (token: string) => run(() => adapter.setItemAsync(key, token)),
    clearIf: (token: string) =>
      run(async () => {
        if ((await adapter.getItemAsync(key)) === token)
          await adapter.deleteItemAsync(key);
      }),
  };
}
