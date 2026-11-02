import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { renameGroupSchema, type LiveGroup } from '@monivo/shared';
import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session';
import { Panel, Chip, SectionTitle } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { View } from 'react-native';

export function GroupSettings({
  group,
  onTransfer,
}: {
  group: LiveGroup;
  onTransfer: () => void;
}) {
  const { token, user } = useSession();
  const client = useQueryClient();
  const [name, setName] = useState(group.name);
  const [target, setTarget] = useState('');
  const [confirm, setConfirm] = useState<'leave' | 'transfer' | null>(null);
  const isOwner = user?.id === group.ownerId;
  const mutation = useMutation({
    mutationFn: async (action: 'rename' | 'transfer' | 'leave') => {
      if (action === 'rename') {
        const input = renameGroupSchema.safeParse({ name });
        if (!input.success)
          throw new Error('Use a group name between 1 and 50 characters.');
        await apiRequest(`/groups/${group.id}`, null, {
          token,
          method: 'PATCH',
          body: input.data,
        });
      } else if (action === 'transfer') {
        if (!target) throw new Error('Choose the new owner first.');
        await apiRequest(`/groups/${group.id}/owner`, null, {
          token,
          method: 'POST',
          body: { newOwnerId: target },
        });
      } else
        await apiRequest(`/groups/${group.id}/leave`, null, {
          token,
          method: 'POST',
        });
      return action;
    },
    onSuccess: async (action) => {
      setConfirm(null);
      if (action === 'transfer') {
        onTransfer();
        setTarget('');
      }
      if (action === 'leave') {
        client.clear();
        router.replace('/');
      } else await client.invalidateQueries();
    },
  });
  return (
    <Panel>
      <SectionTitle>Group settings</SectionTitle>
      {isOwner && (
        <>
          <Text>Group name</Text>
          <Input
            accessibilityLabel="Rename group"
            maxLength={50}
            value={name}
            onChangeText={setName}
          />
          <Button
            variant="secondary"
            disabled={mutation.isPending}
            onPress={() => mutation.mutate('rename')}
          >
            <Text>Save group name</Text>
          </Button>
          {group.members.length > 1 && (
            <>
              <Text className="font-semibold">Transfer ownership</Text>
              <Text className="text-sm text-muted-foreground">
                The new owner manages the group and invitations. Existing invite
                links will be revoked.
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {group.members
                  .filter((m) => m.id !== user?.id)
                  .map((m) => (
                    <Chip
                      key={m.id}
                      selected={target === m.id}
                      onPress={() => {
                        setTarget(m.id);
                        setConfirm(null);
                      }}
                    >
                      {m.name}
                    </Chip>
                  ))}
              </View>
              <Button
                variant="outline"
                disabled={!target || mutation.isPending}
                onPress={() => setConfirm('transfer')}
              >
                <Text>Transfer ownership</Text>
              </Button>
            </>
          )}
        </>
      )}
      <Text className="text-sm text-muted-foreground">
        You can leave only with a zero balance and no pending payments involving
        you. Related expense history will be protected. Existing invite links
        are revoked when someone leaves.
      </Text>
      {isOwner && group.members.length > 1 ? (
        <Text className="text-sm text-muted-foreground">
          Transfer ownership before leaving.
        </Text>
      ) : (
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onPress={() => setConfirm('leave')}
        >
          <Text>Leave group</Text>
        </Button>
      )}
      {confirm && (
        <>
          <Text>
            {confirm === 'transfer'
              ? `Make ${group.members.find((m) => m.id === target)?.name} the owner? You will become a regular member.`
              : group.members.length === 1
                ? 'You are the last member. Leaving closes this group permanently and revokes invitations. Its records are retained.'
                : 'Leave this group? You will lose access. Remaining members keep its expense and payment history.'}
          </Text>
          <Button
            disabled={mutation.isPending}
            onPress={() => mutation.mutate(confirm)}
          >
            <Text>
              {mutation.isPending
                ? 'Saving…'
                : confirm === 'transfer'
                  ? 'Confirm transfer'
                  : 'Confirm leaving'}
            </Text>
          </Button>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onPress={() => setConfirm(null)}
          >
            <Text>Keep things as they are</Text>
          </Button>
        </>
      )}
      {mutation.isError && (
        <>
          <Text accessibilityRole="alert" className="text-destructive">
            {mutation.error.message}
          </Text>
          <Button
            variant="ghost"
            onPress={() => void client.invalidateQueries()}
          >
            <Text>Refresh group and balances</Text>
          </Button>
        </>
      )}
      {mutation.isSuccess && mutation.data === 'rename' && (
        <Text>Group name saved.</Text>
      )}
    </Panel>
  );
}
