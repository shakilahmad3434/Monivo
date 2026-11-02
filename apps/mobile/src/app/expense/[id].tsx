import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import {
  Avatar,
  DemoNotice,
  ErrorState,
  Panel,
  Screen,
  SectionTitle,
} from '@/components/screen';
import { memberName, money } from '@/demo/model';
import { useDemo } from '@/demo/provider';
import { useSession } from '@/auth/session';
import { LiveExpenseScreen } from '@/features/expenses/live';

export default function ExpenseScreen() {
  const { mode } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  return mode === 'authenticated' ? (
    <LiveExpenseScreen id={id} />
  ) : (
    <DemoExpenseScreen />
  );
}

function DemoExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useDemo();
  const expense = state.expenses.find((item) => item.id === id);
  if (!expense)
    return (
      <Screen title="Expense unavailable" back>
        <ErrorState
          message="This sample expense cannot be found. It may have been cleared when the app restarted."
          onRetry={() => router.replace('/')}
        />
      </Screen>
    );
  return (
    <Screen
      title={expense.description}
      subtitle={
        state.groups.find((group) => group.id === expense.groupId)?.name
      }
      back
    >
      <DemoNotice />
      <Panel>
        <Text className="text-xs uppercase tracking-widest text-muted-foreground">
          Total expense
        </Text>
        <Text className="text-4xl font-semibold text-foreground">
          {money(expense.amount)}
        </Text>
        <Text className="text-sm text-muted-foreground">
          Paid by {memberName(expense.payerId)} ·{' '}
          {new Date(expense.date).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </Text>
      </Panel>
      <SectionTitle>Everyone’s share</SectionTitle>
      <Panel>
        {Object.entries(expense.shares).map(([member, amount]) => (
          <View key={member} className="flex-row items-center gap-3 py-2">
            <Avatar name={memberName(member)} />
            <Text className="flex-1 text-base text-foreground">
              {memberName(member)}
            </Text>
            <Text className="text-base font-semibold text-foreground">
              {money(amount)}
            </Text>
          </View>
        ))}
      </Panel>
      <Text className="text-sm leading-6 text-muted-foreground">
        Sample expense details. Editing and change history will be added with
        the expense backend.
      </Text>
    </Screen>
  );
}
