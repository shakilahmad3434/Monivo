type Listener = (token: string) => void;
const listeners = new Set<Listener>();
export function subscribeSessionExpiry(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function reportSessionExpiry(token: string) {
  for (const listener of listeners) listener(token);
}
