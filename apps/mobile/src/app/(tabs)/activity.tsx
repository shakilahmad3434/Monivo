import { router } from 'expo-router';
import { Check, Clock3, Receipt, X } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import {
  DemoNotice,
  EmptyState,
  IconTile,
  Panel,
  Screen,
} from '@/components/screen';
import { memberName, money } from '@/demo/model';
import { useDemo } from '@/demo/provider';
import { useSession } from '@/auth/session';
import { LiveEmptyScreen } from '@/features/groups/live';

export default function ActivityScreen() {
  const { mode } = useSession();
  return mode === 'authenticated' ? (
    <LiveEmptyScreen activity />
  ) : (
    <DemoActivityScreen />
  );
}

function DemoActivityScreen() {
  const { state } = useDemo();
  const activity = [
    ...state.expenses.map((expense) => ({
      id: expense.id,
      date: expense.date,
      title: expense.description,
      detail: `${memberName(expense.payerId)} paid ${money(expense.amount)}`,
      groupId: expense.groupId,
      icon: Receipt,
      expense: true,
    })),
    ...state.settlements.map((payment) => ({
      id: payment.id,
      date: payment.date,
      title: `${memberName(payment.fromId)} → ${memberName(payment.toId)}`,
      detail: `${money(payment.amount)} · ${payment.status === 'pending' ? 'Awaiting confirmation' : payment.status === 'confirmed' ? 'Receipt confirmed' : 'Not received'}`,
      groupId: payment.groupId,
      icon:
        payment.status === 'confirmed'
          ? Check
          : payment.status === 'pending'
            ? Clock3
            : X,
      expense: false,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Screen
      title="The little details."
      subtitle="Every shared expense, in one place."
    >
      <DemoNotice />
      {activity.length === 0 && (
        <EmptyState
          title="A quiet start"
          description="New expenses and recorded payments will appear here."
        />
      )}
      <View className="gap-3">
        {activity.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`View ${item.title}`}
            onPress={() =>
              item.expense
                ? router.push(`/expense/${item.id}`)
                : router.push('/balances')
            }
          >
            <Panel>
              <View className="flex-row items-start gap-3">
                <IconTile icon={item.icon} />
                <View className="flex-1 gap-1">
                  <Text className="text-base font-semibold text-foreground">
                    {item.title}
                  </Text>
                  <Text className="text-sm leading-5 text-muted-foreground">
                    {item.detail}
                  </Text>
                  <Text className="mt-1 text-xs leading-5 text-muted-foreground">
                    {
                      state.groups.find((group) => group.id === item.groupId)
                        ?.name
                    }{' '}
                    ·{' '}
                    {new Date(item.date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Text>
                </View>
              </View>
            </Panel>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
