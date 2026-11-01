import { router, useLocalSearchParams } from 'expo-router';
import { ArrowUpRight, Receipt } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import {
  AddExpenseButton,
  Avatar,
  DemoNotice,
  EmptyState,
  ErrorState,
  IconTile,
  Panel,
  Screen,
  SectionTitle,
} from '@/components/screen';
import { balancesForGroup, memberName, money } from '@/demo/model';
import { useDemo } from '@/demo/provider';
import { palette } from '@/lib/theme';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useDemo();
  const group = state.groups.find((item) => item.id === id);
  if (!group)
    return (
      <Screen title="Group unavailable" back>
        <ErrorState
          message="This sample group is no longer available. Your demo resets when the app restarts."
          onRetry={() => router.replace('/')}
        />
      </Screen>
    );
  const expenses = state.expenses.filter((expense) => expense.groupId === id);
  const balance = Object.values(balancesForGroup(state, id)).reduce(
    (sum, value) => sum + value,
    0,
  );
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  return (
    <Screen title={group.name} subtitle={group.subtitle} back>
      <DemoNotice />
      <View className="flex-row items-center gap-2">
        {group.memberIds.map((member) => (
          <View key={member} className="items-center gap-1">
            <Avatar name={memberName(member)} />
            <Text className="text-xs text-muted-foreground">
              {memberName(member)}
            </Text>
          </View>
        ))}
      </View>
      <Panel>
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Shared so far
        </Text>
        <Text className="text-4xl font-semibold text-foreground">
          {money(total)}
        </Text>
        <View className="flex-row items-center justify-between border-t border-border pt-4">
          <Text className="text-sm text-muted-foreground">
            {balance === 0
              ? 'Your balance'
              : balance > 0
                ? 'You get back'
                : 'You owe'}
          </Text>
          <Text className="text-lg font-semibold text-primary">
            {Object.values(balancesForGroup(state, id)).every(
              (value) => value === 0,
            )
              ? 'Settled up'
              : money(Math.abs(balance))}
          </Text>
        </View>
      </Panel>
      <AddExpenseButton groupId={id} />
      <SectionTitle
        right={
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/balances')}
            className="min-h-11 flex-row items-center gap-1"
          >
            <Text className="text-sm font-semibold text-primary">Balances</Text>
            <ArrowUpRight size={16} color={palette.primary} />
          </Pressable>
        }
      >
        Expenses
      </SectionTitle>
      {expenses.length === 0 && (
        <EmptyState
          title="Make room for memories."
          description="Add your first shared expense. We'll help keep the numbers clear."
        />
      )}
      <View className="gap-3">
        {expenses.map((expense) => (
          <Pressable
            key={expense.id}
            accessibilityRole="button"
            onPress={() => router.push(`/expense/${expense.id}`)}
          >
            <Panel>
              <View className="flex-row items-center gap-3">
                <IconTile icon={Receipt} />
                <View className="flex-1 gap-1">
                  <Text className="text-base font-semibold text-foreground">
                    {expense.description}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {memberName(expense.payerId)} paid ·{' '}
                    {Object.keys(expense.shares).length} people
                  </Text>
                </View>
                <Text className="text-base font-semibold text-foreground">
                  {money(expense.amount)}
                </Text>
              </View>
            </Panel>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
