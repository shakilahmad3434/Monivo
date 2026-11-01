const palette = require('./src/lib/colors.json');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: palette.background,
        foreground: palette.text,
        card: { DEFAULT: palette.white, foreground: palette.text },
        primary: { DEFAULT: palette.primary, foreground: palette.white },
        secondary: { DEFAULT: palette.secondary, foreground: palette.text },
        muted: { DEFAULT: palette.secondary, foreground: palette.muted },
        accent: { DEFAULT: palette.accent, foreground: palette.lilacText },
        destructive: { DEFAULT: palette.danger, foreground: palette.white },
        border: palette.border,
        input: palette.input,
        ring: palette.primary,
        popover: { DEFAULT: palette.white, foreground: palette.text },
        ink: palette.ink,
        sky: { DEFAULT: palette.blueSoft, foreground: palette.blueText },
        peach: { DEFAULT: palette.peachSoft, foreground: palette.peachText },
        lilac: { DEFAULT: palette.lilacSoft, foreground: palette.lilacText },
        butter: { DEFAULT: palette.yellowSoft, foreground: palette.yellowText },
      },
      borderRadius: { lg: '16px', md: '12px', sm: '8px' },
    },
  },
  plugins: [],
};
