import { useState } from 'react';
import { router } from 'expo-router';
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
import { members } from '@/demo/model';
import { useDemo } from '@/demo/provider';

export default function NewGroupScreen() {
  const { addGroup } = useDemo();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>(['you']);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  function save() {
    if (saved) return;
    try {
      addGroup({
        name: name.trim(),
        subtitle: 'Your next shared chapter',
        memberIds: selected,
        kind: 'friends',
      });
      setSaved(true);
      router.replace('/');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Please check the group details.',
      );
    }
  }
  return (
    <Screen
      title="Better, together."
      subtitle="A shared space for your people."
      back
    >
      <DemoNotice />
      <Panel>
        <Text className="text-sm font-semibold text-foreground">
          Group name
        </Text>
        <Input
          accessibilityLabel="Group name"
          placeholder="Flatmates, weekend plans…"
          value={name}
          onChangeText={setName}
          maxLength={50}
        />
      </Panel>
      <SectionTitle>Add your people</SectionTitle>
      <Text className="text-sm leading-6 text-muted-foreground">
        Choose from these sample Monivo members. You’re included automatically.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {members
          .filter((member) => member.id !== 'you')
          .map((member) => (
            <Chip
              key={member.id}
              selected={selected.includes(member.id)}
              onPress={() =>
                setSelected((previous) =>
                  previous.includes(member.id)
                    ? previous.filter((id) => id !== member.id)
                    : [...previous, member.id],
                )
              }
            >
              {member.name}
            </Chip>
          ))}
      </View>
      {!!error && (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {error}
        </Text>
      )}
      <Button disabled={saved} className="min-h-14 rounded-2xl" onPress={save}>
        <Text>Create sample group</Text>
      </Button>
    </Screen>
  );
}
