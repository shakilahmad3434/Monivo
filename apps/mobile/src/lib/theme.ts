import { DefaultTheme } from 'expo-router/react-navigation';
import colors from './colors.json';

export const palette = colors;

export const tones = {
  blue: { background: palette.blueSoft, foreground: palette.blueText },
  peach: { background: palette.peachSoft, foreground: palette.peachText },
  lilac: { background: palette.lilacSoft, foreground: palette.lilacText },
  butter: { background: palette.yellowSoft, foreground: palette.yellowText },
};
export type Tone = keyof typeof tones;

export const NAV_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: palette.background,
    card: palette.white,
    text: palette.text,
    border: palette.border,
    primary: palette.primary,
    notification: palette.danger,
  },
};
