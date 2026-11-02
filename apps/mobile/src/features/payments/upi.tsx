import { useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import {
  objectIdSchema,
  paiseSchema,
  paymentRecipientSchema,
  upiIdSchema,
} from '@monivo/shared';
import { useSession } from '@/auth/session';
import { apiRequest } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Panel } from '@/components/screen';
import { money } from '@/lib/money';
import { upiPaymentUri } from '@/lib/upi';

const draftSchema = z.object({
  groupId: objectIdSchema,
  toId: objectIdSchema,
  amount: paiseSchema,
  upiId: upiIdSchema,
  name: z.string(),
  openedAt: z.string(),
});
type Draft = z.infer<typeof draftSchema>;
const draftKey = (userId: string) => `monivo-upi-${userId}`;
export async function clearUpiReminder(
  userId: string,
  groupId: string,
  toId: string,
) {
  const raw = await SecureStore.getItemAsync(draftKey(userId));
  if (!raw) return;
  const draft = draftSchema.parse(JSON.parse(raw));
  if (draft.groupId === groupId && draft.toId === toId)
    await SecureStore.deleteItemAsync(draftKey(userId));
}

export function UpiReminderNotice() {
  const { user } = useSession();
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    let active = true;
    if (user)
      void SecureStore.getItemAsync(draftKey(user.id))
        .then((raw) => {
          if (active && raw) {
            const parsed = draftSchema.safeParse(JSON.parse(raw));
            if (parsed.success) setDraft(parsed.data);
          }
        })
        .catch(() => {
          /* The handoff screen reports storage errors. */
        });
    return () => {
      active = false;
    };
  }, [user]);
  if (!draft) return null;
  return (
    <Panel>
      <Text>A previous UPI handoff needs checking.</Text>
      <Text>
        {money(draft.amount)} to {draft.name}
      </Text>
      <Button
        variant="outline"
        onPress={() =>
          router.push({
            pathname: '/settlement/[id]',
            params: { id: draft.toId, groupId: draft.groupId },
          })
        }
      >
        <Text>Review previous handoff</Text>
      </Button>
    </Panel>
  );
}

export function UpiHandoff({
  groupId,
  toId,
  amount,
  maximum,
  onRestore,
}: {
  groupId: string;
  toId: string;
  amount: number | null;
  maximum: number;
  onRestore: (amount: number) => void;
}) {
  const { token, user } = useSession();
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [review, setReview] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  const restore = useRef(onRestore);
  restore.current = onRestore;
  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(draftKey(user!.id))
      .then((raw) => {
        if (!active) return;
        if (raw) {
          const saved = draftSchema.parse(JSON.parse(raw));
          setDraft(saved);
          if (saved.groupId === groupId && saved.toId === toId)
            restore.current(saved.amount);
        }
        setReady(true);
      })
      .catch(() => {
        if (active)
          setError(
            'Could not restore your last UPI handoff. Reopen this screen before paying again.',
          );
      });
    return () => {
      active = false;
    };
  }, [user, groupId, toId]);
  async function prepare() {
    if (busy.current || !ready) return;
    if (!amount || amount > maximum) {
      setError('Enter a valid amount within the available balance first.');
      return;
    }
    busy.current = true;
    setWorking(true);
    setError('');
    try {
      const data = await apiRequest(
        `/groups/${groupId}/payment-recipient/${toId}`,
        z.object({ recipient: paymentRecipientSchema }),
        { token },
      );
      if (!data.recipient.upiId)
        throw new Error(
          'This member has not saved a UPI ID. Ask them to add it in Profile, or pay them directly and record it below.',
        );
      setReview({
        groupId,
        toId,
        name: data.recipient.name,
        upiId: data.recipient.upiId,
        amount,
        openedAt: '',
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not load the recipient.',
      );
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }
  async function open() {
    if (busy.current || !review || draft) return;
    if (review.amount !== amount || review.amount > maximum) {
      setReview(null);
      setError('The amount changed. Review the payment again.');
      return;
    }
    busy.current = true;
    setWorking(true);
    setError('');
    try {
      // Recheck the saved address immediately before launch; show a new review if changed.
      const data = await apiRequest(
        `/groups/${groupId}/payment-recipient/${toId}`,
        z.object({ recipient: paymentRecipientSchema }),
        { token },
      );
      if (
        data.recipient.upiId !== review.upiId ||
        data.recipient.name !== review.name
      ) {
        setReview(null);
        throw new Error(
          'The recipient changed their details. Review again before paying.',
        );
      }
      const uri = upiPaymentUri(review.upiId, review.name, review.amount);
      const reminder = { ...review, openedAt: new Date().toISOString() };
      await SecureStore.setItemAsync(
        draftKey(user!.id),
        JSON.stringify(reminder),
      );
      setDraft(reminder);
      setReview(null);
      restore.current(reminder.amount);
      try {
        await Linking.openURL(uri);
      } catch {
        setError(
          'Could not open a UPI app. You can copy the ID below and pay directly. If an app did open, check its history before trying again.',
        );
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not open the payment app.',
      );
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }
  return (
    <Panel>
      <Text className="text-lg font-bold">Pay with a UPI app</Text>
      <Text className="text-sm text-muted-foreground">
        Optional handoff to an installed UPI app. Check the bank recipient name
        and amount there. Opening or returning does not record a payment.
      </Text>
      {!ready ? (
        <Text>{error || 'Checking your last handoff…'}</Text>
      ) : draft ? (
        <>
          <Text className="font-semibold">
            Check your previous payment attempt first.
          </Text>
          <Text>
            {draft.name} · {money(draft.amount)}
          </Text>
          <Text selectable>{draft.upiId}</Text>
          <Text className="text-sm text-muted-foreground">
            A UPI app was requested on{' '}
            {new Date(draft.openedAt).toLocaleString('en-IN')}. Its outcome is
            unknown to Monivo. If successful, record that amount below. If
            pending, check the UPI app’s history before paying again.
          </Text>
          {(draft.groupId !== groupId || draft.toId !== toId) && (
            <Button
              variant="outline"
              onPress={() =>
                router.replace({
                  pathname: '/settlement/[id]',
                  params: { id: draft.toId, groupId: draft.groupId },
                })
              }
            >
              <Text>Open previous recipient</Text>
            </Button>
          )}
          <Button
            variant="outline"
            disabled={working}
            onPress={() => {
              if (busy.current) return;
              busy.current = true;
              setWorking(true);
              void SecureStore.deleteItemAsync(draftKey(user!.id))
                .then(() => {
                  setDraft(null);
                  setError('');
                })
                .catch(() =>
                  setError('Could not clear this reminder. Try again.'),
                )
                .finally(() => {
                  busy.current = false;
                  setWorking(false);
                });
            }}
          >
            <Text>I checked the outcome · clear reminder</Text>
          </Button>
        </>
      ) : review ? (
        <>
          <Text className="font-semibold">Review before opening</Text>
          <Text>
            {review.name} · {money(review.amount)}
          </Text>
          <Text selectable>{review.upiId}</Text>
          <Text className="text-sm text-muted-foreground">
            This is a member-provided ID, not verified by Monivo. Long-press the
            ID to copy it if the payment app does not accept the handoff.
          </Text>
          {Platform.OS === 'android' ? (
            <Button disabled={working} onPress={() => void open()}>
              <Text>{working ? 'Opening…' : 'Open UPI app'}</Text>
            </Button>
          ) : (
            <Text>
              Automatic handoff is supported on Android here. Copy the ID and
              pay in your preferred app.
            </Text>
          )}
          <Button
            variant="outline"
            disabled={working}
            onPress={() => setReview(null)}
          >
            <Text>Back to amount</Text>
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          disabled={working}
          onPress={() => void prepare()}
        >
          <Text>{working ? 'Loading…' : 'Review UPI payment'}</Text>
        </Button>
      )}
      {!!error && ready && (
        <Text accessibilityRole="alert" className="text-destructive">
          {error}
        </Text>
      )}
    </Panel>
  );
}
