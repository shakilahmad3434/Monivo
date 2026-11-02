import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invitePreviewSchema, inviteTokenSchema } from '@monivo/shared';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState, Panel, Screen } from '@/components/screen';
import { useSession } from '@/auth/session';
import { apiRequest } from '@/api/client';
import { groupResponse } from '@/api/groups';

export default function JoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const session = useSession();
  const client = useQueryClient();
  const valid = inviteTokenSchema.safeParse(token).success;
  const authenticated = session.mode === 'authenticated';
  const query = useQuery({
    queryKey: ['invite', session.user?.id, token],
    enabled: valid && authenticated,
    queryFn: () =>
      apiRequest(`/invitations/${token}`, invitePreviewSchema, {
        token: session.token,
      }),
    retry: false,
  });
  const join = useMutation({
    mutationFn: () =>
      apiRequest(`/invitations/${token}/join`, groupResponse, {
        method: 'POST',
        token: session.token,
      }),
    onSuccess: async (data) => {
      await client.invalidateQueries({ queryKey: ['groups'] });
      router.replace(`/group/${data.group.id}`);
    },
  });
  if (!valid)
    return (
      <Screen title="Invitation unavailable" back>
        <ErrorState
          message="This invitation link is invalid."
          onRetry={() => router.replace('/')}
        />
      </Screen>
    );
  return (
    <Screen
      title="Your people are waiting."
      subtitle="Join their shared space on Monivo."
    >
      {!authenticated ? (
        <Panel>
          <Text className="text-sm leading-6 text-muted-foreground">
            Sign in or create your Monivo account with Google before joining
            this group.
          </Text>
          <Button
            onPress={() =>
              router.push({ pathname: '/login', params: { invite: token } })
            }
          >
            <Text>Sign in to join</Text>
          </Button>
        </Panel>
      ) : query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          message={query.error.message}
          onRetry={() => void query.refetch()}
          actionLabel="Try again"
        />
      ) : (
        <Panel>
          <Text className="text-2xl font-semibold">{query.data.groupName}</Text>
          <Text className="text-sm text-muted-foreground">
            {query.data.memberCount} members · invitation expires{' '}
            {new Date(query.data.expiresAt).toLocaleDateString('en-IN')}
          </Text>
          <Button disabled={join.isPending} onPress={() => join.mutate()}>
            <Text>{join.isPending ? 'Joining…' : 'Join group'}</Text>
          </Button>
          {join.isError && (
            <Text
              accessibilityRole="alert"
              className="text-sm text-destructive"
            >
              {join.error.message}
            </Text>
          )}
        </Panel>
      )}
    </Screen>
  );
}
