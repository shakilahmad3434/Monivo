import { router } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Clock3 } from 'lucide-react-native';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import {
  Avatar,
  DemoNotice,
  EmptyState,
  Panel,
  Screen,
  SectionTitle,
} from '@/components/screen';
import {
  balancesForGroup,
  currentUserId,
  memberName,
  money,
} from '@/demo/model';
import { useDemo } from '@/demo/provider';
import { palette } from '@/lib/theme';
import { useSession } from '@/auth/session';
import { LiveLedgerScreen } from '@/features/expenses/live';

export default function BalancesScreen() {
  const { mode } = useSession();
  return mode === 'authenticated' ? (
    <LiveLedgerScreen />
  ) : (
    <DemoBalancesScreen />
  );
}

function DemoBalancesScreen() {
  const { state, respondToPayment } = useDemo();
  const pending = state.settlements.filter(
    (payment) => payment.status === 'pending',
  );
  const rows = state.groups.flatMap((group) =>
    Object.entries(balancesForGroup(state, group.id))
      .filter(([, value]) => value !== 0)
      .map(([id, value]) => ({ group, id, value })),
  );
  return (
    <Screen
      title="A clear balance."
      subtitle="Know where you stand, with everyone."
    >
      <DemoNotice />
      {pending.length > 0 && (
        <>
          <SectionTitle>Awaiting confirmation</SectionTitle>
          {pending.map((payment) => (
            <Panel key={payment.id} className="border-[#E8DCA4] bg-butter">
              <View className="flex-row items-center gap-2">
                <Clock3 color={palette.yellowText} size={18} />
                <Text className="text-xs font-semibold uppercase tracking-widest text-butter-foreground">
                  Payment recorded · pending
                </Text>
              </View>
              <Text className="text-lg font-semibold text-foreground">
                {memberName(payment.fromId)} → {memberName(payment.toId)} ·{' '}
                {money(payment.amount)}
              </Text>
              <Text className="text-sm leading-6 text-muted-foreground">
                {
                  state.groups.find((group) => group.id === payment.groupId)
                    ?.name
                }
                . The balance changes only after receipt is confirmed.
              </Text>
              {payment.toId === currentUserId && (
                <View className="flex-row flex-wrap gap-2">
                  <Button
                    onPress={() => respondToPayment(payment.id, 'confirmed')}
                  >
                    <Text>Confirm receipt</Text>
                  </Button>
                  <Button
                    variant="outline"
                    onPress={() => respondToPayment(payment.id, 'rejected')}
                  >
                    <Text>Not received</Text>
                  </Button>
                </View>
              )}
            </Panel>
          ))}
        </>
      )}
      <SectionTitle>Your balances</SectionTitle>
      {rows.map(({ group, id, value }) => (
        <Panel key={`${group.id}-${id}`}>
          <View className="flex-row items-center gap-3">
            <Avatar name={memberName(id)} />
            <View className="flex-1 gap-1">
              <Text className="text-base font-semibold text-foreground">
                {memberName(id)}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {group.name}
              </Text>
            </View>
            {value > 0 ? (
              <ArrowDownLeft size={20} color={palette.primary} />
            ) : (
              <ArrowUpRight size={20} color={palette.danger} />
            )}
          </View>
          <View className="flex-row flex-wrap items-center justify-between gap-3">
            <View>
              <Text className="text-xs text-muted-foreground">
                {value > 0 ? 'Owes you' : 'You owe'}
              </Text>
              <Text
                className={
                  value > 0
                    ? 'text-2xl font-semibold text-primary'
                    : 'text-2xl font-semibold text-destructive'
                }
              >
                {money(Math.abs(value))}
              </Text>
            </View>
            {value < 0 && (
              <Button
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/settlement/[id]',
                    params: { id, groupId: group.id },
                  })
                }
              >
                <Text>Settle up</Text>
              </Button>
            )}
          </View>
        </Panel>
      ))}
      {rows.length === 0 && (
        <EmptyState
          title="All square."
          description="Everyone is settled up. Your next shared moment starts fresh."
        />
      )}
      <Text className="text-center text-xs leading-5 text-muted-foreground">
        Payments here are user-recorded, not bank-verified.
      </Text>
    </Screen>
  );
}
