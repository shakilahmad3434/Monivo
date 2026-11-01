// Adapted from React Native Reusables for Monivo's theme and native text scaling.
import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

const buttonVariants = cva(
  'relative min-h-12 flex-row flex-wrap items-center justify-center gap-2 rounded-2xl px-5 py-3 web:cursor-pointer web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-primary web:focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary',
        secondary: 'bg-secondary',
        outline: 'border border-border bg-card',
        ghost: 'bg-transparent',
        destructive: 'bg-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);
const buttonTextVariants = cva(
  'text-base font-bold text-center tracking-tight',
  {
    variants: {
      variant: {
        default: 'text-primary-foreground',
        secondary: 'text-secondary-foreground',
        outline: 'text-foreground',
        ghost: 'text-primary',
        destructive: 'text-white',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);
type ButtonProps = React.ComponentProps<typeof Pressable> &
  VariantProps<typeof buttonVariants>;

const surfaces = {
  default: {
    colors: ['#528AFF', '#3072F8', '#2360E1'],
    edge: '#1E4CC3',
    highlight: '#9CBEFF',
    shadow: '#153C9C',
  },
  secondary: {
    colors: ['#FFFFFF', '#FBFBFC', '#F5F5F6'],
    edge: '#E1E1E2',
    highlight: '#FFFFFF',
    shadow: '#232738',
  },
  outline: {
    colors: ['#FFFFFF', '#FBFBFC', '#F5F5F6'],
    edge: '#E1E1E2',
    highlight: '#FFFFFF',
    shadow: '#232738',
  },
  destructive: {
    colors: ['#B3543C', '#A4452F', '#943D2A'],
    edge: '#77301F',
    highlight: '#D58E78',
    shadow: '#943D2A',
  },
  ghost: {
    colors: ['transparent', 'transparent', 'transparent'],
    edge: 'transparent',
    highlight: 'transparent',
    shadow: 'transparent',
  },
} as const;

export function Button({
  className,
  variant,
  style,
  children,
  disabled,
  accessibilityState,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const kind = variant ?? 'default';
  const surface = surfaces[kind];
  const raised = kind !== 'ghost';
  const [pressed, setPressed] = useState(false);
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant })}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
        disabled={disabled}
        className={cn(
          buttonVariants({ variant }),
          disabled && 'opacity-50 web:cursor-not-allowed',
          className,
        )}
        onPressIn={(event) => {
          setPressed(true);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          setPressed(false);
          onPressOut?.(event);
        }}
        style={[
          raised && {
            borderWidth: 1.5,
            borderTopColor: surface.edge,
            borderLeftColor: surface.edge,
            borderRightColor: surface.edge,
            borderBottomColor: surface.edge,
            borderBottomWidth: 2,
          },
          raised &&
            !disabled &&
            (Platform.OS === 'web'
              ? {
                  boxShadow: pressed
                    ? `0 1px 2px ${surface.shadow}22`
                    : `0 2px 0 ${surface.edge}66, 0 5px 9px ${surface.shadow}20`,
                }
              : {
                  shadowColor: surface.shadow,
                  shadowOffset: { width: 0, height: pressed ? 1 : 4 },
                  shadowOpacity: pressed ? 0.1 : 0.22,
                  shadowRadius: pressed ? 2 : 7,
                  elevation: pressed ? 1 : 5,
                }),
          { transform: [{ translateY: pressed && !disabled ? 2 : 0 }] },
          typeof style === 'function' ? style({ pressed }) : style,
        ]}
        {...props}
      >
        {(state) => (
          <>
            {raised && (
              <LinearGradient
                pointerEvents="none"
                accessible={false}
                colors={surface.colors}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.surface}
              />
            )}
            {typeof children === 'function' ? children(state) : children}
            {raised && (
              <>
                <View
                  pointerEvents="none"
                  accessible={false}
                  style={[styles.rim, { borderColor: surface.edge }]}
                />
                <View
                  pointerEvents="none"
                  accessible={false}
                  style={[
                    styles.innerRim,
                    {
                      borderTopColor: surface.highlight,
                      borderLeftColor: `${surface.highlight}99`,
                      borderRightColor: `${surface.highlight}99`,
                      borderBottomColor: `${surface.edge}66`,
                    },
                  ]}
                />
              </>
            )}
          </>
        )}
      </Pressable>
    </TextClassContext.Provider>
  );
}

const styles = StyleSheet.create({
  surface: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 15,
  },
  rim: {
    position: 'absolute',
    top: -1.5,
    left: -1.5,
    right: -1.5,
    bottom: -1.5,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  innerRim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14.5,
    borderWidth: 1,
  },
});
