import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { profileSchema, updateProfileSchema } from '@monivo/shared';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Panel, Screen } from '@/components/screen';
import { useSession } from '@/auth/session';
import { apiRequest } from '@/api/client';

export default function ProfileScreen() {
  const session = useSession();
  const [name, setName] = useState(session.user?.name ?? '');
  const [upiId, setUpiId] = useState(session.user?.upiId ?? '');
  const save = useMutation({
    mutationFn: async () => {
      const parsed = updateProfileSchema.safeParse({
        name,
        upiId: upiId.trim() || null,
      });
      if (!parsed.success)
        throw new Error(
          'Use a name between 1 and 50 characters and a valid UPI ID such as name@bank, or leave it blank.',
        );
      return apiRequest('/me', z.object({ user: profileSchema }), {
        method: 'PATCH',
        token: session.token,
        body: parsed.data,
      });
    },
    onSuccess: (data) => session.updateUser(data.user),
  });
  const logout = useMutation({
    mutationFn: session.logout,
    onSuccess: () => router.replace('/login'),
  });
  return (
    <Screen
      title={session.mode === 'demo' ? 'Your sample space.' : 'Your profile.'}
      back
    >
      {session.user && (
        <Panel>
          <Text className="text-sm font-semibold">Display name</Text>
          <Input
            accessibilityLabel="Display name"
            value={name}
            onChangeText={setName}
            maxLength={50}
          />
          <Text className="text-sm text-muted-foreground">
            {session.user.email}
          </Text>
          <Text className="text-sm font-semibold">UPI ID (optional)</Text>
          <Input
            accessibilityLabel="Your UPI ID"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={100}
            placeholder="yourname@bank"
            value={upiId}
            onChangeText={setUpiId}
          />
          <Text className="text-sm text-muted-foreground">
            Group members can see this when paying you. Monivo checks the
            format, not bank ownership. Verify the ID in your UPI app before
            saving. Leave blank to remove it, then save your profile.
          </Text>
          <Button disabled={save.isPending} onPress={() => save.mutate()}>
            <Text>{save.isPending ? 'Saving…' : 'Save profile'}</Text>
          </Button>
          {save.isSuccess && (
            <Text className="text-sm text-muted-foreground">
              Profile saved.
            </Text>
          )}
        </Panel>
      )}
      <Button
        variant="outline"
        disabled={logout.isPending}
        onPress={() => logout.mutate()}
      >
        <Text>
          {logout.isPending
            ? 'Signing out…'
            : session.mode === 'demo'
              ? 'Leave sample app'
              : 'Sign out'}
        </Text>
      </Button>
      {(save.isError || logout.isError) && (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {(save.error ?? logout.error)?.message}
        </Text>
      )}
    </Screen>
  );
}
