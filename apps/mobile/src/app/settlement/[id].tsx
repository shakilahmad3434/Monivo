import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Avatar,
  DemoNotice,
  EmptyState,
  ErrorState,
  Panel,
  Screen,
} from '@/components/screen';
import {
  balancesForGroup,
  currentUserId,
  memberName,
  money,
  parseAmount,
} from '@/demo/model';
import { useDemo } from '@/demo/provider';
import { useSession } from '@/auth/session';
import { LiveSettlementScreen } from '@/features/payments/live';

export default function SettlementScreen() {
  const { mode } = useSession();
  const { id, groupId } = useLocalSearchParams<{
    id: string;
    groupId: string;
  }>();
  return mode === 'authenticated' ? (
    <LiveSettlementScreen toId={id} groupId={groupId} />
  ) : (
    <DemoSettlementScreen />
  );
}

function DemoSettlementScreen() {
  const { id, groupId } = useLocalSearchParams<{
    id: string;
    groupId: string;
  }>();
  const { state, recordPayment } = useDemo();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const group = state.groups.find((item) => item.id === groupId);
  if (!group || !group.memberIds.includes(id) || id === currentUserId)
    return (
      <Screen title="Payment unavailable" back>
        <ErrorState
          message="Choose someone you owe from your balances."
          onRetry={() => router.replace('/balances')}
        />
      </Screen>
    );
  const outstanding = -(balancesForGroup(state, groupId)[id] ?? 0);
  const pending = state.settlements
    .filter(
      (payment) =>
        payment.groupId === groupId &&
        payment.fromId === currentUserId &&
        payment.toId === id &&
        payment.status === 'pending',
    )
    .reduce((sum, payment) => sum + payment.amount, 0);
  const available = Math.max(0, outstanding - pending);
  function save() {
    const parsed = parseAmount(amount);
    if (saved) return;
    if (!parsed || parsed > available) {
      setError(`Enter an amount between ₹0.01 and ${money(available)}.`);
      return;
    }
    recordPayment({ groupId, toId: id, amount: parsed });
    setSaved(true);
    router.replace('/balances');
  }
  return (
    <Screen title="A little closer to square." subtitle={group.name} back>
      <DemoNotice />
      <Panel>
        <View className="flex-row items-center gap-3">
          <Avatar name={memberName(id)} />
          <Text className="text-lg font-semibold text-foreground">
            You → {memberName(id)}
          </Text>
        </View>
        <Text className="text-sm text-muted-foreground">
          Outstanding balance
        </Text>
        <Text className="text-4xl font-semibold text-foreground">
          {money(Math.max(0, outstanding))}
        </Text>
        {pending > 0 && (
          <Text className="text-sm leading-6 text-muted-foreground">
            {money(pending)} already awaiting confirmation.
          </Text>
        )}
      </Panel>
      {available === 0 ? (
        <EmptyState
          title="You're up to date."
          description="There is no additional payment to record. Pending payments still need confirmation."
        />
      ) : (
        <>
          <Panel>
            <Text className="text-sm font-semibold text-foreground">
              Amount paid (INR)
            </Text>
            <Input
              accessibilityLabel="Settlement amount in rupees"
              keyboardType="decimal-pad"
              placeholder={(available / 100).toFixed(2)}
              value={amount}
              onChangeText={setAmount}
            />
            <Button
              variant="secondary"
              onPress={() => setAmount((available / 100).toFixed(2))}
            >
              <Text>Use full amount · {money(available)}</Text>
            </Button>
          </Panel>
          <Text className="text-sm leading-6 text-muted-foreground">
            Record a payment after paying outside Monivo. {memberName(id)} needs
            to confirm receipt before your balance changes. This sample does not
            transfer money.
          </Text>
          {!!error && (
            <Text
              accessibilityRole="alert"
              className="text-sm text-destructive"
            >
              {error}
            </Text>
          )}
          <Button
            disabled={saved}
            className="min-h-14 rounded-2xl"
            onPress={save}
          >
            <Text>Record sample payment</Text>
          </Button>
        </>
      )}
    </Screen>
  );
}
