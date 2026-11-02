import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createExpenseSchema,
  expenseInputSchema,
  objectIdSchema,
  splitEqually,
  type ExpenseInput,
  type LiveExpense,
  type LiveGroup,
} from '@monivo/shared';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  Screen,
  SectionTitle,
} from '@/components/screen';
import { useSession } from '@/auth/session';
import { apiRequest, ApiError } from '@/api/client';
import { useGroup, useGroups } from '@/api/groups';
import { UpiReminderNotice } from '@/features/payments/upi';
import {
  PaymentHistory,
  PaymentOptions,
  UnfinishedPaymentNotice,
} from '@/features/payments/live';
import {
  expenseResponse,
  money,
  parsePaise,
  useExpense,
  useExpenses,
  useLedger,
} from '@/api/expenses';

const message = (e: unknown) =>
  e instanceof Error ? e.message : 'Please try again.';
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });
type Pending = { groupId: string; requestId: string; expense: ExpenseInput };

export function LiveExpenseFormScreen({
  groupId,
  editId,
}: {
  groupId?: string;
  editId?: string;
}) {
  const groups = useGroups();
  const existing = useExpense(editId ?? '');
  if (groups.isPending || (editId && existing.isPending))
    return (
      <Screen title="Your expense" back>
        <LoadingState />
      </Screen>
    );
  if (groups.isError || (editId && existing.isError))
    return (
      <Screen title="Expense unavailable" back>
        <ErrorState
          message={message(groups.error ?? existing.error)}
          onRetry={() => {
            void groups.refetch();
            if (editId) void existing.refetch();
          }}
        />
      </Screen>
    );
  const expense = editId ? existing.data?.expense : undefined;
  if (expense?.locked)
    return (
      <Screen title="Expense protected" back>
        <Panel>
          <Text>
            This expense is protected by a payment or member departure. Add a
            correction expense instead.
          </Text>
        </Panel>
      </Screen>
    );
  const group = groups.data?.groups.find(
    (g) => g.id === (expense?.groupId ?? groupId),
  );
  if (!group)
    return (
      <Screen title="Choose your group" back>
        <EmptyState
          title="Start from a group."
          description="Open one of your groups to add an expense."
        />
        <Button onPress={() => router.replace('/')}>
          <Text>Your groups</Text>
        </Button>
      </Screen>
    );
  return (
    <ExpenseEditor
      key={expense ? `${expense.id}-${expense.version}` : group.id}
      group={group}
      existing={expense}
    />
  );
}

function ExpenseEditor({
  group,
  existing,
}: {
  group: LiveGroup;
  existing?: LiveExpense;
}) {
  const { token, user } = useSession();
  const client = useQueryClient();
  const [payerId, setPayer] = useState(existing?.payerId ?? user!.id);
  const [participants, setParticipants] = useState(
    existing?.shares.map((s) => s.userId) ?? group.members.map((m) => m.id),
  );
  const [splitMode, setMode] = useState<'equal' | 'custom'>(
    existing?.splitMode ?? 'equal',
  );
  const [custom, setCustom] = useState<Record<string, string>>(
    Object.fromEntries(
      existing?.shares.map((s) => [s.userId, (s.amount / 100).toFixed(2)]) ??
        [],
    ),
  );
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [ready, setReady] = useState(!!existing);
  const busy = useRef(false);
  const pendingKey = `monivo-expense-${user!.id}`;
  useEffect(() => {
    if (existing) return;
    let active = true;
    void SecureStore.getItemAsync(pendingKey)
      .then((raw) => {
        if (!active) return;
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          const data = createExpenseSchema
            .extend({
              groupId: objectIdSchema,
            })
            .parse(parsed);
          setPending(data);
        }
        setReady(true);
      })
      .catch(() => {
        if (active)
          setError(
            'Could not restore your last save. Reopen this screen to retry.',
          );
      });
    return () => {
      active = false;
    };
  }, [pendingKey, existing]);
  const save = useMutation({
    mutationFn: async (input: ExpenseInput | null) => {
      if (existing)
        return apiRequest(`/expenses/${existing.id}`, expenseResponse, {
          token,
          method: 'PATCH',
          body: { version: existing.version, expense: input },
        });
      const request = pending ?? {
        groupId: group.id,
        requestId: uuid(),
        expense: input!,
      };
      await SecureStore.setItemAsync(pendingKey, JSON.stringify(request));
      setPending(request);
      const result = await apiRequest(
        `/groups/${request.groupId}/expenses`,
        expenseResponse,
        {
          token,
          method: 'POST',
          body: { requestId: request.requestId, expense: request.expense },
        },
      );
      await SecureStore.deleteItemAsync(pendingKey);
      return result;
    },
    onSuccess: async (data) => {
      await client.invalidateQueries();
      router.replace(
        data.expense.deleted
          ? `/group/${data.expense.groupId}`
          : `/expense/${data.expense.id}`,
      );
    },
    onError: async (e) => {
      // A definite rejection can be corrected; network/timeout/server errors must retry the same save.
      if (
        !existing &&
        e instanceof ApiError &&
        [400, 403, 404].includes(e.status)
      ) {
        try {
          await SecureStore.deleteItemAsync(pendingKey);
          setPending(null);
        } catch {
          /* Preserve the retry until storage works. */
        }
      }
      setError(message(e));
      busy.current = false;
    },
  });
  const form = useForm({
    defaultValues: {
      description: existing?.description ?? '',
      amount: existing ? (existing.amount / 100).toFixed(2) : '',
    },
    onSubmit: async ({ value }) => {
      if (busy.current || !ready) return;
      setError('');
      const amount = parsePaise(value.amount);
      const shares =
        splitMode === 'equal'
          ? splitEqually(amount ?? 0, participants)
          : participants.map((userId) => ({
              userId,
              amount: parsePaise(custom[userId] ?? '') ?? -1,
            }));
      const input = expenseInputSchema.safeParse({
        description: value.description,
        amount,
        payerId,
        splitMode,
        shares,
      });
      if (!input.success) {
        setError(
          'Enter a description, a positive amount, and shares that add up to the total. Maximum ₹10,00,000 per expense.',
        );
        return;
      }
      busy.current = true;
      save.mutate(input.data);
    },
  });
  if (!ready)
    return (
      <Screen title="Restoring your save" back>
        <LoadingState />
        {!!error && <Text accessibilityRole="alert">{error}</Text>}
      </Screen>
    );
  if (pending && !existing)
    return (
      <Screen title="Finish your last save" back>
        <Panel>
          <Text className="text-xl font-bold">
            {pending.expense.description}
          </Text>
          <Text>{money(pending.expense.amount)}</Text>
          <Text>
            Retry this save to check whether it reached Monivo. It will only be
            added once, even if you closed the app.
          </Text>
        </Panel>
        {!!error && (
          <Text accessibilityRole="alert" className="text-destructive">
            {error}
          </Text>
        )}
        <Button
          disabled={save.isPending}
          onPress={() => {
            if (!busy.current) {
              busy.current = true;
              save.mutate(null);
            }
          }}
        >
          <Text>{save.isPending ? 'Checking…' : 'Retry saved expense'}</Text>
        </Button>
      </Screen>
    );
  return (
    <Screen
      title={existing ? 'Edit expense' : 'One expense. All shared.'}
      subtitle={group.name}
      back
    >
      <Panel>
        <form.Field name="description">
          {(field) => (
            <>
              <Text>What was it for?</Text>
              <Input
                accessibilityLabel="Expense description"
                maxLength={80}
                value={field.state.value}
                onChangeText={field.handleChange}
                placeholder="Dinner, groceries…"
              />
            </>
          )}
        </form.Field>
        <form.Field name="amount">
          {(field) => (
            <>
              <Text>Amount (INR)</Text>
              <Input
                accessibilityLabel="Expense amount in rupees"
                keyboardType="decimal-pad"
                value={field.state.value}
                onChangeText={field.handleChange}
                placeholder="0.00"
              />
            </>
          )}
        </form.Field>
      </Panel>
      <SectionTitle>Paid by</SectionTitle>
      <View className="flex-row flex-wrap gap-2">
        {group.members.map((m) => (
          <Chip
            key={m.id}
            selected={payerId === m.id}
            onPress={() => setPayer(m.id)}
          >
            {m.name}
          </Chip>
        ))}
      </View>
      <SectionTitle>Split between</SectionTitle>
      <View className="flex-row flex-wrap gap-2">
        {group.members.map((m) => (
          <Chip
            key={m.id}
            selected={participants.includes(m.id)}
            onPress={() =>
              setParticipants((ids) =>
                ids.includes(m.id)
                  ? ids.filter((id) => id !== m.id)
                  : [...ids, m.id],
              )
            }
          >
            {m.name}
          </Chip>
        ))}
      </View>
      <View className="flex-row gap-2">
        <Chip selected={splitMode === 'equal'} onPress={() => setMode('equal')}>
          Equally
        </Chip>
        <Chip
          selected={splitMode === 'custom'}
          onPress={() => setMode('custom')}
        >
          Custom amounts
        </Chip>
      </View>
      <form.Subscribe selector={(s) => s.values.amount}>
        {(value) => (
          <Panel>
            {participants.map((id) => (
              <View
                key={id}
                className="flex-row items-center justify-between gap-3"
              >
                <Text className="flex-1">
                  {group.members.find((m) => m.id === id)?.name}
                </Text>
                {splitMode === 'equal' ? (
                  <Text>
                    {money(
                      splitEqually(parsePaise(value) ?? 0, participants).find(
                        (s) => s.userId === id,
                      )?.amount ?? 0,
                    )}
                  </Text>
                ) : (
                  <Input
                    className="w-32"
                    accessibilityLabel={`${group.members.find((m) => m.id === id)?.name} share in rupees`}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    value={custom[id] ?? ''}
                    onChangeText={(text) =>
                      setCustom((v) => ({ ...v, [id]: text }))
                    }
                  />
                )}
              </View>
            ))}
            <Text className="text-xs text-muted-foreground">
              Equal splits distribute remaining paise in a stable member order.
              Custom shares must match the total.
            </Text>
          </Panel>
        )}
      </form.Subscribe>
      {!!error && (
        <Text accessibilityRole="alert" className="text-destructive">
          {error}
        </Text>
      )}
      {save.error instanceof ApiError &&
        save.error.status === 409 &&
        existing && (
          <Button
            variant="outline"
            onPress={() => {
              void client.invalidateQueries({
                queryKey: ['expense', user?.id, existing.id],
              });
              router.replace(`/expense/${existing.id}`);
            }}
          >
            <Text>Reload latest expense</Text>
          </Button>
        )}
      <Button
        disabled={save.isPending}
        onPress={() => void form.handleSubmit()}
      >
        <Text>
          {save.isPending
            ? 'Saving…'
            : existing
              ? 'Save changes'
              : 'Add expense'}
        </Text>
      </Button>
    </Screen>
  );
}

export function ExpenseRows({ groupId }: { groupId: string }) {
  const query = useExpenses(groupId);
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <ErrorState
        message={message(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  return (
    <>
      <Button variant="ghost" onPress={() => void query.refetch()}>
        <Text>{query.isFetching ? 'Refreshing…' : 'Refresh expenses'}</Text>
      </Button>
      {!query.data.expenses.length && (
        <EmptyState
          title="Your first shared expense."
          description="Add an expense to start tracking what everyone paid and owes."
        />
      )}
      {query.data.expenses.map((e) => (
        <Button
          key={e.id}
          variant="outline"
          className="justify-between"
          onPress={() => router.push(`/expense/${e.id}`)}
        >
          <Text className="flex-1">{e.description}</Text>
          <Text>{money(e.amount)}</Text>
        </Button>
      ))}
    </>
  );
}

export function LiveExpenseScreen({ id }: { id: string }) {
  const query = useExpense(id);
  const group = useGroup(query.data?.expense.groupId ?? '');
  const { token, user } = useSession();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({
    mutationFn: () =>
      apiRequest(`/expenses/${id}`, null, {
        method: 'DELETE',
        token,
        body: { version: query.data!.expense.version },
      }),
    onSuccess: async () => {
      await client.invalidateQueries();
      router.replace(`/group/${query.data!.expense.groupId}`);
    },
  });
  if (query.isPending)
    return (
      <Screen title="Your expense" back>
        <LoadingState />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen title="Expense unavailable" back>
        <ErrorState
          message={message(query.error)}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  const e = query.data.expense;
  const name = (id: string) =>
    [
      ...(group.data?.group.members ?? []),
      ...(group.data?.group.formerMembers ?? []),
    ].find((m) => m.id === id)?.name ?? 'Member';
  return (
    <Screen title={e.description} subtitle={group.data?.group.name} back>
      <Panel>
        <Text className="text-4xl font-bold">{money(e.amount)}</Text>
        <Text>Paid by {name(e.payerId)}</Text>
        <Text>
          {new Date(e.createdAt).toLocaleDateString('en-IN')} ·{' '}
          {e.splitMode === 'equal' ? 'Equal split' : 'Custom split'}
        </Text>
        {e.version > 1 && <Text>Edited · version {e.version}</Text>}
      </Panel>
      <SectionTitle>Everyone’s share</SectionTitle>
      <Panel>
        {e.shares.map((s) => (
          <View key={s.userId} className="flex-row justify-between">
            <Text>{name(s.userId)}</Text>
            <Text>{money(s.amount)}</Text>
          </View>
        ))}
      </Panel>
      {e.locked && (
        <Panel>
          <Text>
            This expense is protected by a payment or member departure. Add a
            correction expense if anything needs adjusting.
          </Text>
        </Panel>
      )}
      {e.createdBy === user?.id && !e.locked && (
        <>
          <Button
            onPress={() =>
              router.push({ pathname: '/expense/new', params: { editId: id } })
            }
          >
            <Text>Edit expense</Text>
          </Button>
          <Button
            variant="outline"
            disabled={remove.isPending}
            onPress={() => setConfirm(true)}
          >
            <Text>Delete expense</Text>
          </Button>
          {confirm && (
            <Panel>
              <Text>
                Delete this expense? Its shares will be removed from everyone’s
                balance.
              </Text>
              <Button
                disabled={remove.isPending}
                onPress={() => remove.mutate()}
              >
                <Text>
                  {remove.isPending ? 'Deleting…' : 'Confirm deletion'}
                </Text>
              </Button>
              <Button variant="outline" onPress={() => setConfirm(false)}>
                <Text>Keep expense</Text>
              </Button>
            </Panel>
          )}
        </>
      )}
      {remove.isError && (
        <ErrorState
          message={message(remove.error)}
          onRetry={() => {
            setConfirm(false);
            void query.refetch();
          }}
          actionLabel="Refresh expense"
        />
      )}
    </Screen>
  );
}

export function LiveLedgerScreen({ activity = false }: { activity?: boolean }) {
  const query = useLedger();
  const { user } = useSession();
  return (
    <Screen
      title={activity ? 'The little details.' : 'A clear balance.'}
      subtitle={
        activity
          ? 'Expenses and recorded payments, together.'
          : 'Your net position in each group.'
      }
    >
      <UnfinishedPaymentNotice key={query.dataUpdatedAt} />
      <UpiReminderNotice key={`upi-${query.dataUpdatedAt}`} />
      <Button
        variant="ghost"
        disabled={query.isFetching}
        onPress={() => void query.refetch()}
      >
        <Text>{query.isFetching ? 'Refreshing…' : 'Refresh'}</Text>
      </Button>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          message={message(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : activity ? (
        <>
          <PaymentHistory
            payments={query.data.payments}
            groups={query.data.balances}
          />
          {!query.data.expenses.length && !query.data.payments.length && (
            <EmptyState
              title="A quiet start."
              description="New expenses and payment records will appear here."
            />
          )}
          {query.data.expenses.map((e) => (
            <Button
              key={e.id}
              variant="outline"
              className="justify-between"
              onPress={() => router.push(`/expense/${e.id}`)}
            >
              <View className="flex-1">
                <Text>{e.description}</Text>
                <Text className="text-xs text-muted-foreground">
                  {
                    query.data.balances.find((g) => g.groupId === e.groupId)
                      ?.groupName
                  }{' '}
                  · {new Date(e.updatedAt).toLocaleDateString('en-IN')}
                  {e.version > 1 ? ' · Edited' : ''}
                </Text>
              </View>
              <Text>{money(e.amount)}</Text>
            </Button>
          ))}
        </>
      ) : (
        <>
          <PaymentHistory
            payments={query.data.payments}
            groups={query.data.balances}
            pendingOnly
          />
          {!query.data.balances.length && (
            <EmptyState
              title="Start with your people."
              description="Create a group to start sharing expenses."
            />
          )}
          {query.data.balances.map((g) => {
            const amount =
              g.members.find((m) => m.userId === user?.id)?.amount ?? 0;
            return (
              <Panel key={g.groupId}>
                <Text className="text-xl font-bold">{g.groupName}</Text>
                <Text>
                  {amount > 0
                    ? 'You get back'
                    : amount < 0
                      ? 'You owe'
                      : 'All square'}
                </Text>
                <Text className="text-3xl font-bold">
                  {money(Math.abs(amount))}
                </Text>
                <Button
                  variant="outline"
                  onPress={() => router.push(`/group/${g.groupId}`)}
                >
                  <Text>View group</Text>
                </Button>
                <PaymentOptions group={g} />
              </Panel>
            );
          })}
          <Text className="text-sm text-muted-foreground">
            Balances include confirmed payments. Pending, rejected, and
            cancelled records do not change them. Payments are user-recorded,
            not bank-verified.
          </Text>
        </>
      )}
    </Screen>
  );
}
