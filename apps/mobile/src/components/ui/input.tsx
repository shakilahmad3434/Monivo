// Adapted from React Native Reusables; minimum height leaves room for larger text.
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@/lib/utils';
import { palette } from '@/lib/theme';

export function Input({ className, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={palette.muted}
      className={cn(
        'min-h-12 rounded-xl border border-input bg-card px-4 py-3 text-base text-foreground',
        props.editable === false && 'opacity-50',
        className,
      )}
      {...props}
    />
  );
}
