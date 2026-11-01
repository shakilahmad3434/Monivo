import { useState } from 'react';
import { router } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import {
  AddExpenseButton,
  Avatar,
  Chip,
  DemoNotice,
  EmptyState,
  GroupRow,
  Screen,
  SectionTitle,
} from '@/components/screen';
import { useDemo } from '@/demo/provider';
import { balancesForGroup, money } from '@/demo/model';
import { palette } from '@/lib/theme';

export default function GroupsScreen() {
  const { state } = useDemo();
  const [filter, setFilter] = useState('All groups');
  const groups = state.groups.map((group) => ({
    group,
    balance: Object.values(balancesForGroup(state, group.id)).reduce(
      (sum, value) => sum + value,
      0,
    ),
  }));
  const values = state.groups.flatMap((group) =>
    Object.values(balancesForGroup(state, group.id)),
  );
  const owed = values
    .filter((value) => value > 0)
    .reduce((sum, value) => sum + value, 0);
  const owe = -values
    .filter((value) => value < 0)
    .reduce((sum, value) => sum + value, 0);
  const visible = groups.filter(
    ({ group }) =>
      filter !== 'Settled up' ||
      Object.values(balancesForGroup(state, group.id)).every(
        (value) => value === 0,
      ),
  );
  return (
    <Screen
      title="Life happens. Split it."
      subtitle="Your people. Your plans. All in one place."
      action={<Avatar name="You" />}
    >
      <DemoNotice />
      <View className="relative overflow-hidden gap-5 rounded-[28px] bg-ink p-6">
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute -right-8 -top-8 h-40 w-40 rounded-full border-[24px] border-[#363B54]"
        />
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-semibold tracking-[2px] text-[#CFD2E3]">
            THE BIG PICTURE
          </Text>
          <View className="h-7 w-7 items-center justify-center rounded-full bg-butter">
            <ArrowUpRight size={16} color={palette.ink} />
          </View>
        </View>
        <View className="gap-2">
          <Text className="text-sm text-[#CFD2E3]">Your net balance</Text>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            numberOfLines={1}
            className="text-5xl font-semibold tracking-tight text-white"
          >
            {owed - owe < 0 ? '−' : ''}
            {money(Math.abs(owed - owe))}
          </Text>
          <Text className="text-sm leading-5 text-[#CFD2E3]">
            {owed < owe
              ? 'To settle across your groups'
              : 'Coming back across your groups'}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1 gap-3 rounded-3xl bg-sky p-4">
          <ArrowDownLeft size={21} color={palette.blueText} />
          <Text className="text-xs font-medium text-sky-foreground">
            You get back
          </Text>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            numberOfLines={1}
            className="text-xl font-semibold tracking-tight text-sky-foreground"
          >
            {money(owed)}
          </Text>
        </View>
        <View className="flex-1 gap-3 rounded-3xl bg-peach p-4">
          <ArrowUpRight size={21} color={palette.peachText} />
          <Text className="text-xs font-medium text-peach-foreground">
            You owe
          </Text>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            numberOfLines={1}
            className="text-xl font-semibold tracking-tight text-peach-foreground"
          >
            {money(owe)}
          </Text>
        </View>
      </View>
      <AddExpenseButton />
      <SectionTitle
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create group"
            onPress={() => router.push('/group/new')}
            className="min-h-11 flex-row items-center gap-1"
          >
            <Plus size={17} color={palette.primary} />
            <Text className="text-sm font-semibold text-primary">
              New group
            </Text>
          </Pressable>
        }
      >
        Your groups
      </SectionTitle>
      <View className="flex-row gap-2">
        {['All groups', 'Settled up'].map((item) => (
          <Chip
            key={item}
            selected={filter === item}
            onPress={() => setFilter(item)}
          >
            {item}
          </Chip>
        ))}
      </View>
      <View className="gap-3">
        {visible.map(({ group, balance }) => (
          <GroupRow
            key={group.id}
            group={group}
            balance={balance}
            settled={Object.values(balancesForGroup(state, group.id)).every(
              (value) => value === 0,
            )}
          />
        ))}
        {visible.length === 0 && (
          <EmptyState
            title="A fresh start"
            description="No groups here yet. Create one to share your next expense."
          />
        )}
      </View>
      <Text className="text-center text-xs text-muted-foreground">
        A little clarity goes a long way.
      </Text>
    </Screen>
  );
}
