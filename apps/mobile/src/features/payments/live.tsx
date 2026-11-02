import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import {
  createPaymentSchema,
  objectIdSchema,
  paymentSchema,
  type LivePayment,
} from '@monivo/shared';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  Screen,
  SectionTitle,
} from '@/components/screen';
import { useSession } from '@/auth/session';
import { ApiError, apiRequest } from '@/api/client';
import { money, parsePaise, useLedger } from '@/api/expenses';

type Balance = NonNullable<
  ReturnType<typeof useLedger>['data']
>['balances'][number];
const responseSchema = z.object({ payment: paymentSchema });
const pendingSchema = createPaymentSchema.extend({ groupId: objectIdSchema });
type Pending = z.infer<typeof pendingSchema>;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Please try again.';
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === 'x' ? n : (n & 3) | 8).toString(16);
  });

export function UnfinishedPaymentNotice() {
  const { user } = useSession();
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    let active = true;
    if (user)
      void SecureStore.getItemAsync(`monivo-payment-${user.id}`)
        .then((raw) => {
          if (active && raw) {
            const result = pendingSchema.safeParse(JSON.parse(raw));
            if (result.success) setPending(result.data);
          }
        })
        .catch(() => {
          /* The payment form displays storage errors when opened. */
        });
    return () => {
      active = false;
    };
  }, [user]);
  if (!pending) return null;
  return (
    <Panel>
      <Text>A payment save needs checking.</Text>
      <Button
        onPress={() =>
          router.push({
            pathname: '/settlement/[id]',
            params: { id: pending.toId, groupId: pending.groupId },
          })
        }
      >
        <Text>Check unfinished payment</Text>
      </Button>
    </Panel>
  );
}

export function PaymentOptions({ group }: { group: Balance }) {
  const { user } = useSession();
  const sender = group.members.find((m) => m.userId === user?.id);
  if (!sender || sender.availableToPay === 0) return null;
  return (
    <View className="gap-3">
      <Text className="text-sm text-muted-foreground">
        Record money you already paid outside Monivo. These options use group
        net balances.
      </Text>
      {group.members
        .filter((m) => m.availableToReceive > 0 && m.userId !== user?.id)
        .map((m) => (
          <Button
            key={m.userId}
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: '/settlement/[id]',
                params: { id: m.userId, groupId: group.groupId },
              })
            }
          >
            <Text>Record payment to {m.name}</Text>
          </Button>
        ))}
    </View>
  );
}

export function PaymentHistory({
  payments,
  groups,
  pendingOnly = false,
}: {
  payments: LivePayment[];
  groups: Balance[];
  pendingOnly?: boolean;
}) {
  const { user } = useSession();
  const rows = pendingOnly
    ? payments.filter(
        (p) =>
          p.status === 'pending' &&
          (p.fromId === user?.id || p.toId === user?.id),
      )
    : payments;
  if (!rows.length) return null;
  return (
    <View className="gap-3">
      <SectionTitle>
        {pendingOnly ? 'Awaiting confirmation' : 'Recorded payments'}
      </SectionTitle>
      {rows.map((payment) => (
        <PaymentCard
          key={payment.id}
          payment={payment}
          group={groups.find((g) => g.groupId === payment.groupId)}
        />
      ))}
    </View>
  );
}

function PaymentCard({
  payment,
  group,
}: {
  payment: LivePayment;
  group?: Balance;
}) {
  const { token, user } = useSession();
  const client = useQueryClient();
  const [action, setAction] = useState<'confirm' | 'reject' | 'cancel' | null>(
    null,
  );
  const mutation = useMutation({
    mutationFn: (action: 'confirm' | 'reject' | 'cancel') =>
      apiRequest(`/payments/${payment.id}/respond`, responseSchema, {
        token,
        method: 'POST',
        body: { action },
      }),
    onSuccess: async () => {
      setAction(null);
      await client.invalidateQueries();
    },
  });
  const name = (id: string) =>
    id === user?.id
      ? 'You'
      : (group?.members.find((m) => m.userId === id)?.name ?? 'Member');
  return (
    <Panel>
      <Text className="text-lg font-bold">
        {name(payment.fromId)} → {name(payment.toId)}
      </Text>
      <Text className="text-2xl font-bold">{money(payment.amount)}</Text>
      <Text className="text-sm text-muted-foreground">
        {group?.groupName} ·{' '}
        {new Date(payment.updatedAt).toLocaleDateString('en-IN')}
      </Text>
      <Text>
        {payment.status === 'pending'
          ? 'Pending · balance unchanged'
          : payment.status === 'confirmed'
            ? 'Receipt confirmed · balance updated'
            : payment.status === 'rejected'
              ? 'Not received · balance unchanged'
              : 'Cancelled · balance unchanged'}
      </Text>
      {payment.status === 'pending' && !action && (
        <View className="gap-2">
          {payment.toId === user?.id && (
            <>
              <Button onPress={() => setAction('confirm')}>
                <Text>Confirm receipt</Text>
              </Button>
              <Button variant="outline" onPress={() => setAction('reject')}>
                <Text>Not received</Text>
              </Button>
            </>
          )}
          {payment.fromId === user?.id && (
            <Button variant="outline" onPress={() => setAction('cancel')}>
              <Text>Cancel record</Text>
            </Button>
          )}
        </View>
      )}
      {payment.status === 'pending' && action && (
        <>
          <Text>
            {action === 'confirm'
              ? `Have you received ${money(payment.amount)}? Confirmation updates both balances and cannot be undone here.`
              : action === 'reject'
                ? 'Mark this payment as not received? Balances will stay unchanged.'
                : 'Cancel this payment record? Balances will stay unchanged.'}
          </Text>
          <Button
            disabled={mutation.isPending}
            onPress={() => mutation.mutate(action)}
          >
            <Text>
              {mutation.isPending
                ? 'Saving…'
                : action === 'confirm'
                  ? 'Yes, received'
                  : action === 'reject'
                    ? 'Mark not received'
                    : 'Yes, cancel record'}
            </Text>
          </Button>
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onPress={() => setAction(null)}
          >
            <Text>Go back</Text>
          </Button>
        </>
      )}
      {mutation.isError && (
        <ErrorState
          message={errorMessage(mutation.error)}
          onRetry={() => void client.invalidateQueries()}
          actionLabel="Refresh status"
        />
      )}
    </Panel>
  );
}

export function LiveSettlementScreen({
  toId,
  groupId,
}: {
  toId: string;
  groupId: string;
}) {
  const query = useLedger();
  const { token, user } = useSession();
  const client = useQueryClient();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [ready, setReady] = useState(false);
  const busy = useRef(false);
  const key = `monivo-payment-${user!.id}`;
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(key)
      .then((raw) => {
        if (active) {
          if (raw) setPending(pendingSchema.parse(JSON.parse(raw)));
          setReady(true);
        }
      })
      .catch(() => {
        if (active)
          setError(
            'Could not restore your last payment save. Reopen this screen to retry.',
          );
      });
    return () => {
      active = false;
    };
  }, [key]);
  const save = useMutation({
    mutationFn: async (request: Pending) => {
      await SecureStore.setItemAsync(key, JSON.stringify(request));
      setPending(request);
      const { groupId, ...body } = request;
      const result = await apiRequest(
        `/groups/${groupId}/payments`,
        responseSchema,
        { token, method: 'POST', body },
      );
      await SecureStore.deleteItemAsync(key);
      return result;
    },
    onSuccess: async () => {
      await client.invalidateQueries();
      router.replace('/balances');
    },
    onError: async (error) => {
      if (
        error instanceof ApiError &&
        [400, 403, 404, 409].includes(error.status)
      ) {
        try {
          await SecureStore.deleteItemAsync(key);
          setPending(null);
        } catch {
          /* Keep retry available if local storage fails. */
        }
        await client.invalidateQueries();
      }
      setError(errorMessage(error));
      busy.current = false;
    },
  });
  const submit = (request: Pending) => {
    if (busy.current) return;
    busy.current = true;
    setError('');
    save.mutate(request);
  };
  if (!ready || query.isPending)
    return (
      <Screen title="Your payment" back>
        <LoadingState />
        {!!error && <Text accessibilityRole="alert">{error}</Text>}
      </Screen>
    );
  if (pending) {
    const g = query.data?.balances.find((g) => g.groupId === pending.groupId);
    return (
      <Screen title="Finish your last save" back>
        <Panel>
          <Text>{g?.groupName}</Text>
          <Text className="text-xl font-bold">
            {money(pending.amount)} to{' '}
            {g?.members.find((m) => m.userId === pending.toId)?.name ??
              'your group member'}
          </Text>
          <Text>
            Retry to check whether Monivo received this record. The same save is
            only recorded once.
          </Text>
        </Panel>
        {!!error && (
          <Text accessibilityRole="alert" className="text-destructive">
            {error}
          </Text>
        )}
        <Button disabled={save.isPending} onPress={() => submit(pending)}>
          <Text>{save.isPending ? 'Checking…' : 'Retry saved payment'}</Text>
        </Button>
      </Screen>
    );
  }
  if (query.isError)
    return (
      <Screen title="Payment unavailable" back>
        <ErrorState
          message={errorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  const group = query.data?.balances.find((g) => g.groupId === groupId);
  const recipient = group?.members.find((m) => m.userId === toId);
  const sender = group?.members.find((m) => m.userId === user?.id);
  const maximum = Math.min(
    sender?.availableToPay ?? 0,
    recipient?.availableToReceive ?? 0,
    100_000_000,
  );
  if (!group || !recipient || toId === user?.id)
    return (
      <Screen title="Payment unavailable" back>
        <ErrorState
          message="Choose a group member from your balances."
          onRetry={() => router.replace('/balances')}
        />
      </Screen>
    );
  return (
    <Screen title="A little closer to square." subtitle={group.groupName} back>
      <Panel>
        <Text className="text-lg font-bold">You → {recipient.name}</Text>
        <Text>Available to record</Text>
        <Text className="text-4xl font-bold">{money(maximum)}</Text>
        <Text className="text-sm text-muted-foreground">
          Pending payments already reserve their amounts.
        </Text>
      </Panel>
      {maximum <= 0 ? (
        <EmptyState
          title="Nothing more to record."
          description="Refresh balances to check pending payments and recent changes."
        />
      ) : (
        <>
          <Panel>
            <Text>Amount paid (INR)</Text>
            <Input
              accessibilityLabel="Payment amount in rupees"
              keyboardType="decimal-pad"
              placeholder="0.00"
              value={amount}
              onChangeText={setAmount}
            />
            <Button
              variant="secondary"
              onPress={() => setAmount((maximum / 100).toFixed(2))}
            >
              <Text>Use full amount · {money(maximum)}</Text>
            </Button>
          </Panel>
          <Text className="text-sm text-muted-foreground">
            Record only after paying outside Monivo. {recipient.name} must
            confirm receipt before balances change. Monivo does not transfer or
            verify money.
          </Text>
          <Button
            disabled={save.isPending}
            onPress={() => {
              const parsed = parsePaise(amount);
              if (!parsed || parsed > maximum) {
                setError(
                  `Enter an amount between ₹0.01 and ${money(maximum)}.`,
                );
                return;
              }
              submit({ groupId, toId, amount: parsed, requestId: uuid() });
            }}
          >
            <Text>{save.isPending ? 'Recording…' : 'Record payment'}</Text>
          </Button>
        </>
      )}
      {!!error && (
        <Text accessibilityRole="alert" className="text-destructive">
          {error}
        </Text>
      )}
      <Button variant="outline" onPress={() => void query.refetch()}>
        <Text>Refresh balances</Text>
      </Button>
    </Screen>
  );
}
