// Adapted from React Native Reusables.
import { createContext, useContext, type ComponentProps } from 'react';
import { Text as NativeText } from 'react-native';
import { cn } from '@/lib/utils';

export const TextClassContext = createContext<string | undefined>(undefined);
export function Text({
  className,
  ...props
}: ComponentProps<typeof NativeText>) {
  const context = useContext(TextClassContext);
  return (
    <NativeText
      className={cn('text-base text-foreground', context, className)}
      {...props}
    />
  );
}
