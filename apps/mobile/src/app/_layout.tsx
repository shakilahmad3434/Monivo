import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { Suspense } from 'react';
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
        message="We couldn't show this screen. Try reloading your sample space."
        onRetry={retry}
        actionLabel="Try again"
      />
    </Screen>
  );
}

export default function RootLayout() {
  return (
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
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.background },
            }}
          />
        </Suspense>
        <PortalHost />
      </ThemeProvider>
    </DemoProvider>
  );
}
