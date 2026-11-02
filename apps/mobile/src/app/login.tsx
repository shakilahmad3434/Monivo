import { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { inviteTokenSchema } from '@monivo/shared';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Panel, Screen } from '@/components/screen';
import { useSession } from '@/auth/session';
import { googleConfigured, supportsGoogleSignIn } from '@/auth/google';
import { apiUrl } from '@/api/client';

export default function LoginScreen() {
  const session = useSession();
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (session.mode === 'authenticated')
    return (
      <Redirect
        href={
          inviteTokenSchema.safeParse(invite).success ? `/join/${invite}` : '/'
        }
      />
    );
  if (session.mode === 'demo' && !invite) return <Redirect href="/" />;
  async function signIn() {
    setBusy(true);
    setError('');
    try {
      await session.signIn();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Sign-in failed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  const available = googleConfigured && supportsGoogleSignIn && !!apiUrl;
  return (
    <Screen
      title="Good company. Clear balances."
      subtitle="Share the moment. We’ll help with the numbers."
    >
      <View className="gap-3 rounded-3xl bg-ink p-6">
        <Text className="text-3xl font-bold text-white">
          Made for your people.
        </Text>
        <Text className="text-base leading-7 text-[#CFD2E3]">
          From everyday groceries to your next getaway. Keep everyone on the
          same page.
        </Text>
      </View>
      <Panel>
        <Text className="text-xl font-semibold">Welcome to Monivo</Text>
        <Text className="text-sm leading-6 text-muted-foreground">
          Sign in with Google to create your account or return to your groups.
        </Text>
        <Button disabled={!available || busy} onPress={() => void signIn()}>
          <Text>{busy ? 'Signing in…' : 'Continue with Google'}</Text>
        </Button>
        {!available && (
          <Text className="text-sm leading-6 text-muted-foreground">
            {!supportsGoogleSignIn
              ? 'Google sign-in is available in the Monivo Android development build. You can explore the sample app here.'
              : 'Sign-in setup is still in progress. You can explore the sample app below.'}
          </Text>
        )}
        {!!error && (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        )}
        {session.restoreError && (
          <>
            <Text className="text-sm text-destructive">
              {session.restoreError}
            </Text>
            <Button variant="outline" onPress={session.retryRestore}>
              <Text>Retry saved session</Text>
            </Button>
          </>
        )}
      </Panel>
      <Button
        variant="outline"
        onPress={() => {
          session.exploreDemo();
          router.replace('/');
        }}
      >
        <Text>Explore the sample app</Text>
      </Button>
      <Text className="text-center text-xs leading-5 text-muted-foreground">
        Sample data stays separate from your real groups.
      </Text>
    </Screen>
  );
}
