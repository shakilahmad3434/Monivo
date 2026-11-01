import { useRef, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Chip,
  DemoNotice,
  Panel,
  Screen,
  SectionTitle,
} from '@/components/screen';
import { equalShares, memberName, money, parseAmount } from '@/demo/model';
import { useDemo } from '@/demo/provider';

export default function NewExpenseScreen() {
  const params = useLocalSearchParams<{ groupId?: string }>();
  const { state, addExpense } = useDemo();
  const initialGroup =
    state.groups.find((group) => group.id === params.groupId) ??
    state.groups[0];
  const [groupId, setGroupId] = useState(initialGroup?.id ?? '');
  const group = state.groups.find((item) => item.id === groupId);
  const [payerId, setPayerId] = useState('you');
  const [participants, setParticipants] = useState(
    initialGroup?.memberIds ?? [],
  );
  const [mode, setMode] = useState<'equal' | 'custom'>('equal');
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const saved = useRef(false);
  const form = useForm({
    defaultValues: { description: '', amount: '' },
    onSubmit: ({ value }) => {
      if (saved.current) return;
      setError('');
      const amount = parseAmount(value.amount);
      if (!amount || !group || participants.length === 0) {
        setError('Enter a valid amount and select at least one person.');
        return;
      }
      const shares =
        mode === 'equal'
          ? equalShares(amount, participants)
          : Object.fromEntries(
              participants.map((id) => [
                id,
                parseAmount(custom[id] ?? '') ?? 0,
              ]),
            );
      if (
        mode === 'custom' &&
        participants.some(
          (id) =>
            custom[id]?.trim() !== '0' &&
            custom[id]?.trim() !== '0.00' &&
            parseAmount(custom[id] ?? '') === null,
        )
      ) {
        setError(
          'Enter each share with up to two decimal places. Use 0 for no share.',
        );
        return;
      }
      if (
        Object.values(shares).reduce((sum, share) => sum + share, 0) !== amount
      ) {
        setError('The shares must add up to the total expense.');
        return;
      }
      try {
        addExpense({
          groupId,
          description: value.description.trim(),
          amount,
          payerId,
          shares,
        });
        saved.current = true;
        router.replace(`/group/${groupId}`);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Please check the expense.',
        );
      }
    },
  });
  return (
    <Screen
      title="One expense. All shared."
      subtitle="A few details, and everyone’s in the loop."
      back
    >
      <DemoNotice />
      <View className="gap-3">
        <SectionTitle>Choose a group</SectionTitle>
        <View className="flex-row flex-wrap gap-2">
          {state.groups.map((item) => (
            <Chip
              key={item.id}
              selected={groupId === item.id}
              onPress={() => {
                setGroupId(item.id);
                setParticipants(item.memberIds);
                setPayerId('you');
                setCustom({});
                setError('');
              }}
            >
              {item.name}
            </Chip>
          ))}
        </View>
      </View>
      <Panel>
        <form.Field
          name="amount"
          validators={{
            onChange: ({ value }) =>
              value && !parseAmount(value)
                ? 'Enter a positive amount with up to two decimal places.'
                : undefined,
            onSubmit: ({ value }) =>
              !parseAmount(value) ? 'Enter a valid amount.' : undefined,
          }}
        >
          {(field) => (
            <View className="gap-2">
              <Text className="text-sm font-semibold text-foreground">
                Amount (INR)
              </Text>
              <Input
                accessibilityLabel="Expense amount in rupees"
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={field.state.value}
                onChangeText={field.handleChange}
                onBlur={field.handleBlur}
                className="min-h-16 text-3xl font-semibold"
              />
              {field.state.meta.errors.map((message) => (
                <Text
                  key={String(message)}
                  accessibilityRole="alert"
                  className="text-xs text-destructive"
                >
                  {message}
                </Text>
              ))}
            </View>
          )}
        </form.Field>
        <form.Field
          name="description"
          validators={{
            onSubmit: ({ value }) =>
              !value.trim()
                ? 'What was this expense for?'
                : value.trim().length > 80
                  ? 'Keep the description within 80 characters.'
                  : undefined,
          }}
        >
          {(field) => (
            <View className="gap-2">
              <Text className="text-sm font-semibold text-foreground">
                What was it for?
              </Text>
              <Input
                accessibilityLabel="Expense description"
                placeholder="Dinner, groceries, a good time…"
                maxLength={80}
                value={field.state.value}
                onChangeText={field.handleChange}
                onBlur={field.handleBlur}
              />
              {field.state.meta.errors.map((message) => (
                <Text
                  key={String(message)}
                  accessibilityRole="alert"
                  className="text-xs text-destructive"
                >
                  {message}
                </Text>
              ))}
            </View>
          )}
        </form.Field>
      </Panel>
      <View className="gap-3">
        <SectionTitle>Paid by</SectionTitle>
        <View className="flex-row flex-wrap gap-2">
          {group?.memberIds.map((id) => (
            <Chip
              key={id}
              selected={payerId === id}
              onPress={() => setPayerId(id)}
            >
              {memberName(id)}
            </Chip>
          ))}
        </View>
      </View>
      <View className="gap-3">
        <SectionTitle>Split between</SectionTitle>
        <View className="flex-row flex-wrap gap-2">
          {group?.memberIds.map((id) => (
            <Chip
              key={id}
              selected={participants.includes(id)}
              onPress={() =>
                setParticipants((previous) =>
                  previous.includes(id)
                    ? previous.filter((item) => item !== id)
                    : [...previous, id],
                )
              }
            >
              {memberName(id)}
            </Chip>
          ))}
        </View>
        <View className="mt-2 flex-row gap-2">
          <Chip selected={mode === 'equal'} onPress={() => setMode('equal')}>
            Equally
          </Chip>
          <Chip selected={mode === 'custom'} onPress={() => setMode('custom')}>
            Custom amounts
          </Chip>
        </View>
      </View>
      <form.Subscribe selector={(formState) => formState.values.amount}>
        {(value) => {
          const total = parseAmount(value);
          const shares =
            total && participants.length
              ? equalShares(total, participants)
              : {};
          return (
            <Panel>
              {participants.length === 0 && (
                <Text className="text-sm text-destructive">
                  Select at least one person.
                </Text>
              )}
              {participants.map((id) => (
                <View
                  key={id}
                  className="flex-row items-center justify-between gap-3"
                >
                  <Text className="flex-1 text-base text-foreground">
                    {memberName(id)}
                  </Text>
                  {mode === 'equal' ? (
                    <Text className="text-base font-semibold text-foreground">
                      {money(shares[id] ?? 0)}
                    </Text>
                  ) : (
                    <Input
                      accessibilityLabel={`${memberName(id)} share in rupees`}
                      className="w-32"
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      value={custom[id] ?? ''}
                      onChangeText={(text) =>
                        setCustom((previous) => ({ ...previous, [id]: text }))
                      }
                    />
                  )}
                </View>
              ))}
              <Text className="text-xs leading-5 text-muted-foreground">
                {mode === 'equal'
                  ? 'Any remaining paise go to the first selected people, one each.'
                  : 'Custom shares must match the full expense amount.'}
              </Text>
            </Panel>
          );
        }}
      </form.Subscribe>
      {!!error && (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {error}
        </Text>
      )}
      <form.Subscribe selector={(formState) => formState.isSubmitting}>
        {(submitting) => (
          <Button
            disabled={submitting}
            className="min-h-14 rounded-2xl"
            onPress={() => void form.handleSubmit()}
          >
            <Text>{submitting ? 'Adding…' : 'Add sample expense'}</Text>
          </Button>
        )}
      </form.Subscribe>
    </Screen>
  );
}
