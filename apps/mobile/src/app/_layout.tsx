import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { Suspense, useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { SessionProvider, useSession } from '@/auth/session';
import { ApiError } from '@/api/client';
import { StatusBar } from 'expo-status-bar';
import '../../global.css';
import { DemoProvider } from '@/demo/provider';
import { PortalHost } from '@rn-primitives/portal';
import { NAV_THEME, palette } from '@/lib/theme';
import { ThemeProvider } from 'expo-router/react-navigation';
import { ErrorState, LoadingState, Screen } from '@/components/screen';

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen title="Let's try that again.">
      <ErrorState
        message="We couldn't show this screen. Please try again."
        onRetry={retry}
        actionLabel="Try again"
      />
    </Screen>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: (count, error) =>
        !(error instanceof ApiError && error.status < 500) && count < 1,
    },
    mutations: { retry: false },
  },
});

function Navigator() {
  const { mode, ready } = useSession();
  if (!ready)
    return (
      <Screen title="Welcome to Monivo">
        <LoadingState />
      </Screen>
    );
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="join/[token]" />
      <Stack.Protected guard={mode !== 'signedOut'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="group" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="expense" />
        <Stack.Screen name="settlement" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    focusManager.setFocused(AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', (state) =>
      focusManager.setFocused(state === 'active'),
    );
    return () => {
      listener.remove();
      focusManager.setFocused(undefined);
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <DemoProvider>
          <ThemeProvider value={NAV_THEME}>
            <StatusBar style="dark" />
            <Suspense
              fallback={
                <Screen title="Welcome to Monivo">
                  <LoadingState />
                </Screen>
              }
            >
              <Navigator />
            </Suspense>
            <PortalHost />
          </ThemeProvider>
        </DemoProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
