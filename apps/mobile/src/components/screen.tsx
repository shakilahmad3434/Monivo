import { router } from 'expo-router';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Coffee,
  Home,
  Plane,
  Plus,
  type LucideIcon,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { palette, tones, type Tone } from '@/lib/theme';
import { money, type Group } from '@/demo/model';

export function Screen({
  children,
  title,
  subtitle,
  back = false,
  action,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: ReactNode;
}) {
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      className="flex-1 bg-background"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 20,
            paddingBottom: 40,
            gap: 20,
            maxWidth: 680,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 gap-2">
              {back && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  onPress={() =>
                    router.canGoBack() ? router.back() : router.replace('/')
                  }
                  className="mb-2 min-h-11 w-11 justify-center"
                >
                  <ArrowLeft color={palette.text} size={24} />
                </Pressable>
              )}
              <View className="mb-2 flex-row items-center gap-2">
                <View className="h-2 w-2 rounded-full bg-primary" />
                <Text className="text-sm font-bold tracking-[2px] text-foreground">
                  MONIVO
                </Text>
              </View>
              <Text
                accessibilityRole="header"
                className="text-3xl font-bold leading-10 tracking-tight text-foreground"
              >
                {title}
              </Text>
              {subtitle && (
                <Text className="text-base leading-6 text-muted-foreground">
                  {subtitle}
                </Text>
              )}
            </View>
            {action}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function DemoNotice() {
  return (
    <View className="flex-row items-center gap-2 rounded-xl bg-secondary px-3 py-2">
      <Text className="flex-1 text-xs leading-5 text-muted-foreground">
        Sample space · Changes reset on restart.
      </Text>
    </View>
  );
}
export function Panel({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn(
        'gap-4 rounded-3xl border border-border bg-card p-5',
        className,
      )}
      {...props}
    />
  );
}
export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text
        accessibilityRole="header"
        className="text-xl font-semibold text-foreground"
      >
        {children}
      </Text>
      {right}
    </View>
  );
}
export function IconTile({
  icon: Icon,
  tone = 'blue',
}: {
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <View
      className="h-12 w-12 items-center justify-center rounded-2xl"
      style={{ backgroundColor: tones[tone].background }}
    >
      <Icon size={23} color={tones[tone].foreground} strokeWidth={1.8} />
    </View>
  );
}
export function Avatar({ name }: { name: string }) {
  const tone =
    tones[
      (['blue', 'peach', 'lilac', 'butter'] as const)[name.charCodeAt(0) % 4] ??
        'blue'
    ];
  return (
    <View
      className="h-10 w-10 items-center justify-center rounded-full border-2 border-card"
      style={{ backgroundColor: tone.background }}
    >
      <Text className="text-sm font-bold" style={{ color: tone.foreground }}>
        {name.slice(0, 1)}
      </Text>
    </View>
  );
}
export function Chip({
  children,
  selected = false,
  onPress,
}: {
  children: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'min-h-11 justify-center rounded-full border px-4 py-2',
        selected ? 'border-ink bg-ink' : 'border-border bg-card',
      )}
    >
      <Text
        className={cn(
          'text-sm font-medium',
          selected ? 'text-primary-foreground' : 'text-muted-foreground',
        )}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function GroupRow({
  group,
  balance,
  settled,
}: {
  group: Group;
  balance: number;
  settled: boolean;
}) {
  const icon =
    group.kind === 'home' ? Home : group.kind === 'trip' ? Plane : Coffee;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${group.name}, ${settled ? 'settled up' : `net balance ${money(balance)}`}`}
      onPress={() => router.push(`/group/${group.id}`)}
    >
      <Panel>
        <View className="flex-row items-start gap-3">
          <IconTile
            icon={icon}
            tone={
              group.kind === 'home'
                ? 'blue'
                : group.kind === 'trip'
                  ? 'peach'
                  : 'lilac'
            }
          />
          <View className="flex-1 gap-1">
            <Text className="text-lg font-semibold text-foreground">
              {group.name}
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              {group.memberIds.length} members ·{' '}
              {group.kind === 'trip' ? 'Trip' : 'Everyday'}
            </Text>
          </View>
          <ChevronRight size={18} color={palette.muted} />
        </View>
        <View className="flex-row items-center justify-between border-t border-border pt-4">
          <Text className="text-xs text-muted-foreground">
            {settled
              ? 'All good here'
              : balance > 0
                ? 'Net you get back'
                : balance < 0
                  ? 'Net you owe'
                  : 'Mixed balances · view details'}
          </Text>
          <Text
            className={cn(
              'text-lg font-semibold',
              settled
                ? 'text-muted-foreground'
                : balance < 0
                  ? 'text-destructive'
                  : 'text-sky-foreground',
            )}
          >
            {settled ? 'Settled up' : money(Math.abs(balance))}
          </Text>
        </View>
      </Panel>
    </Pressable>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Panel className="items-center py-10">
      <IconTile icon={Check} />
      <Text className="text-center text-xl font-semibold text-foreground">
        {title}
      </Text>
      <Text className="text-center text-sm leading-6 text-muted-foreground">
        {description}
      </Text>
      {action}
    </Panel>
  );
}
export function LoadingState() {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading sample space"
      className="gap-4 py-8"
    >
      <ActivityIndicator color={palette.primary} />
      <Text className="text-center text-muted-foreground">
        Getting your space ready…
      </Text>
    </View>
  );
}
export function ErrorState({
  message,
  onRetry,
  actionLabel = 'Go back',
}: {
  message: string;
  onRetry: () => void;
  actionLabel?: string;
}) {
  return (
    <Panel>
      <Text className="text-lg font-semibold text-foreground">
        Something needs another look
      </Text>
      <Text className="text-sm leading-6 text-muted-foreground">{message}</Text>
      <Button variant="outline" onPress={onRetry}>
        <Text>{actionLabel}</Text>
      </Button>
    </Panel>
  );
}
export function AddExpenseButton({ groupId }: { groupId?: string }) {
  return (
    <Button
      className="min-h-14 flex-row gap-3 rounded-2xl"
      onPress={() =>
        router.push({
          pathname: '/expense/new',
          params: groupId ? { groupId } : {},
        })
      }
    >
      <View className="h-6 w-6 items-center justify-center">
        <Plus color={palette.white} size={22} strokeWidth={2} />
      </View>
      <Text className="text-xl font-semibold tracking-normal">Add expense</Text>
    </Button>
  );
}
export function DirectionMark() {
  return <ArrowUpRight size={18} color={palette.primary} />;
}
