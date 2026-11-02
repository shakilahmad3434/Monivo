import { useState } from 'react';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Share, View } from 'react-native';
import { ChevronRight, Plus, Users } from 'lucide-react-native';
import { createGroupSchema, inviteResponseSchema } from '@monivo/shared';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Avatar,
  Chip,
  EmptyState,
  ErrorState,
  IconTile,
  LoadingState,
  Panel,
  Screen,
  SectionTitle,
} from '@/components/screen';
import { useSession } from '@/auth/session';
import { apiRequest } from '@/api/client';
import { groupResponse, useGroup, useGroups } from '@/api/groups';
import { palette } from '@/lib/theme';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Please try again.';

export function LiveGroupsScreen() {
  const { user } = useSession();
  const query = useGroups();
  return (
    <Screen
      title={`Your shared space.`}
      subtitle={`Welcome, ${user?.name ?? 'friend'}. Bring your people together.`}
      action={
        <Button
          variant="ghost"
          accessibilityLabel="Your profile"
          onPress={() => router.push('/profile')}
        >
          <Avatar name={user?.name ?? 'You'} />
        </Button>
      }
    >
      <Button onPress={() => router.push('/group/new')}>
        <View className="h-6 w-6">
          <Plus color={palette.white} size={24} />
        </View>
        <Text>Create a group</Text>
      </Button>
      <SectionTitle>Your groups</SectionTitle>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          message={errorMessage(query.error)}
          onRetry={() => void query.refetch()}
          actionLabel="Try again"
        />
      ) : query.data.groups.length === 0 ? (
        <EmptyState
          title="Start with your people."
          description="Create a group, then share an invitation. Already have a link? Open it on this phone to join."
        />
      ) : (
        query.data.groups.map((group) => (
          <Button
            key={group.id}
            variant="outline"
            onPress={() => router.push(`/group/${group.id}`)}
            className="justify-start gap-3 p-5"
          >
            <IconTile
              icon={Users}
              tone={
                group.kind === 'trip'
                  ? 'peach'
                  : group.kind === 'home'
                    ? 'blue'
                    : 'lilac'
              }
            />
            <View className="flex-1 gap-1">
              <Text className="text-lg font-semibold text-foreground">
                {group.name}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {group.members.length}{' '}
                {group.members.length === 1 ? 'member' : 'members'}
              </Text>
            </View>
            <ChevronRight color={palette.muted} size={18} />
          </Button>
        ))
      )}
    </Screen>
  );
}

export function LiveNewGroupScreen() {
  const { token } = useSession();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'home' | 'trip' | 'friends'>('friends');
  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = createGroupSchema.safeParse({ name, kind });
      if (!parsed.success)
        throw new Error('Enter a group name between 1 and 50 characters.');
      return apiRequest('/groups', groupResponse, {
        method: 'POST',
        token,
        body: parsed.data,
      });
    },
    onSuccess: async (data) => {
      await client.invalidateQueries({ queryKey: ['groups'] });
      router.replace(`/group/${data.group.id}`);
    },
  });
  return (
    <Screen
      title="Better, together."
      subtitle="Make a space for your next shared chapter."
      back
    >
      <Panel>
        <Text className="text-sm font-semibold">Group name</Text>
        <Input
          accessibilityLabel="Group name"
          value={name}
          onChangeText={setName}
          maxLength={50}
          placeholder="Flatmates, weekend plans…"
        />
      </Panel>
      <SectionTitle>What brings you together?</SectionTitle>
      <View className="flex-row flex-wrap gap-2">
        {(['friends', 'home', 'trip'] as const).map((item) => (
          <Chip
            key={item}
            selected={kind === item}
            onPress={() => setKind(item)}
          >
            {item === 'home' ? 'Home' : item === 'trip' ? 'Trip' : 'Friends'}
          </Chip>
        ))}
      </View>
      <Text className="text-sm leading-6 text-muted-foreground">
        You’ll be the first member. Invite friends after creating the group;
        they join using their own Monivo accounts.
      </Text>
      {mutation.isError && (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {errorMessage(mutation.error)}
        </Text>
      )}
      <Button disabled={mutation.isPending} onPress={() => mutation.mutate()}>
        <Text>{mutation.isPending ? 'Creating…' : 'Create group'}</Text>
      </Button>
    </Screen>
  );
}

export function LiveGroupScreen({ id }: { id: string }) {
  const { token, user } = useSession();
  const query = useGroup(id);
  const [shareError, setShareError] = useState('');
  const invite = useMutation({
    mutationFn: () =>
      apiRequest(`/groups/${id}/invite`, inviteResponseSchema, {
        method: 'POST',
        token,
      }),
  });
  const revoke = useMutation({
    mutationFn: () =>
      apiRequest(`/groups/${id}/invite`, null, { method: 'DELETE', token }),
    onSuccess: () => invite.reset(),
  });
  if (query.isPending)
    return (
      <Screen title="Your group" back>
        <LoadingState />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen title="Group unavailable" back>
        <ErrorState
          message={errorMessage(query.error)}
          onRetry={() => void query.refetch()}
          actionLabel="Try again"
        />
      </Screen>
    );
  const group = query.data.group;
  const url = invite.data
    ? Linking.createURL(`join/${invite.data.token}`, { scheme: 'monivo' })
    : '';
  return (
    <Screen
      title={group.name}
      subtitle={`${group.members.length} ${group.members.length === 1 ? 'member' : 'members'} · ${group.kind}`}
      back
    >
      <SectionTitle>Your people</SectionTitle>
      <Panel>
        {group.members.map((member) => (
          <View key={member.id} className="flex-row items-center gap-3">
            <Avatar name={member.name} />
            <Text className="flex-1 font-medium">
              {member.name}
              {member.id === user?.id ? ' (you)' : ''}
            </Text>
            {member.id === group.ownerId && (
              <Text className="text-xs text-muted-foreground">Owner</Text>
            )}
          </View>
        ))}
      </Panel>
      {group.ownerId === user?.id && (
        <Panel>
          <SectionTitle>Bring everyone in.</SectionTitle>
          <Text className="text-sm leading-6 text-muted-foreground">
            Invite links last seven days. Creating a new one replaces the
            previous link.
          </Text>
          <Button
            disabled={invite.isPending || revoke.isPending}
            onPress={() => invite.mutate()}
          >
            <Text>
              {invite.isPending
                ? 'Creating…'
                : invite.data
                  ? 'Replace invitation'
                  : 'Create invitation'}
            </Text>
          </Button>
          {invite.data && (
            <>
              <Input
                accessibilityLabel="Group invitation link"
                value={url}
                editable={false}
              />
              <Text className="text-xs text-muted-foreground">
                Expires{' '}
                {new Date(invite.data.expiresAt).toLocaleDateString('en-IN')}
              </Text>
              <Button
                variant="secondary"
                onPress={() => {
                  void Share.share({
                    message: `Join ${group.name} on Monivo: ${url}`,
                  }).catch(() =>
                    setShareError(
                      'Could not open sharing. You can select and copy the invitation link.',
                    ),
                  );
                }}
              >
                <Text>Share invitation</Text>
              </Button>
            </>
          )}
          <Button
            variant="outline"
            disabled={invite.isPending || revoke.isPending}
            onPress={() => revoke.mutate()}
          >
            <Text>{revoke.isPending ? 'Revoking…' : 'Revoke invitation'}</Text>
          </Button>
          {(invite.isError || revoke.isError || shareError) && (
            <Text
              accessibilityRole="alert"
              className="text-sm text-destructive"
            >
              {shareError || errorMessage(invite.error ?? revoke.error)}
            </Text>
          )}
          {revoke.isSuccess && (
            <Text className="text-sm text-muted-foreground">
              Invitation revoked. Existing members keep their access.
            </Text>
          )}
        </Panel>
      )}
      <EmptyState
        title="Your group is ready."
        description="Your people are all in one place. Shared expenses will appear here once expense tracking is available."
      />
    </Screen>
  );
}

export function LiveEmptyScreen({ activity = false }: { activity?: boolean }) {
  return (
    <Screen
      title={activity ? 'Your shared moments.' : 'A clear balance.'}
      subtitle={
        activity ? 'Keep the little details together.' : 'Know where you stand.'
      }
    >
      <EmptyState
        title={activity ? 'A quiet start.' : 'Nothing to settle yet.'}
        description={
          activity
            ? 'Your group expenses and payments will appear here.'
            : 'Balances appear when your group starts recording expenses.'
        }
      />
    </Screen>
  );
}
