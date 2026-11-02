import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';
import {
  profileSchema,
  sessionResponseSchema,
  type Profile,
} from '@monivo/shared';
import { z } from 'zod';
import { ApiError, apiRequest } from '@/api/client';
import { googleIdToken } from './google';

const key = 'monivo-session';
type SessionContextValue = {
  ready: boolean;
  mode: 'signedOut' | 'demo' | 'authenticated';
  token?: string;
  user?: Profile;
  restoreError?: string;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  exploreDemo: () => void;
  updateUser: (user: Profile) => void;
  retryRestore: () => void;
};
const SessionContext = createContext<SessionContextValue | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [mode, setMode] = useState<SessionContextValue['mode']>('signedOut');
  const [token, setToken] = useState<string>();
  const [user, setUser] = useState<Profile>();
  const [ready, setReady] = useState(false);
  const [restoreError, setRestoreError] = useState<string>();
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const saved =
          Platform.OS === 'web' ? null : await SecureStore.getItemAsync(key);
        if (saved) {
          const data = await apiRequest(
            '/me',
            z.object({ user: profileSchema }),
            { token: saved },
          );
          if (!cancelled) {
            setToken(saved);
            setUser(data.user);
            setMode('authenticated');
          }
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          try {
            await SecureStore.deleteItemAsync(key);
          } catch {
            if (!cancelled)
              setRestoreError(
                'Could not clear the expired session. Please retry.',
              );
          }
        } else if (!cancelled)
          setRestoreError(
            'Could not reconnect your saved session. Check your connection, then retry.',
          );
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [restoreAttempt]);
  async function signIn() {
    const idToken = await googleIdToken();
    if (!idToken) return;
    const data = await apiRequest('/auth/google', sessionResponseSchema, {
      method: 'POST',
      body: { idToken },
    });
    await SecureStore.setItemAsync(key, data.token);
    client.clear();
    setRestoreError(undefined);
    setToken(data.token);
    setUser(data.user);
    setMode('authenticated');
  }
  async function logout() {
    if (token) {
      try {
        await apiRequest('/auth/logout', null, { method: 'POST', token });
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      }
    }
    if (mode === 'authenticated' && Platform.OS !== 'web')
      await SecureStore.deleteItemAsync(key);
    client.clear();
    setToken(undefined);
    setUser(undefined);
    setMode('signedOut');
    setRestoreError(undefined);
  }
  return (
    <SessionContext.Provider
      value={{
        ready,
        mode,
        token,
        user,
        restoreError,
        signIn,
        logout,
        updateUser: setUser,
        retryRestore: () => {
          setRestoreError(undefined);
          setReady(false);
          setRestoreAttempt((value) => value + 1);
        },
        exploreDemo: () => {
          client.clear();
          setToken(undefined);
          setUser(undefined);
          setMode('demo');
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider is missing');
  return context;
}
