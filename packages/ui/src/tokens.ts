import { useColorScheme } from 'react-native';

export const lightColors = {
  ground: '#F7F5F0',
  surface: '#FFFFFF',
  ink: '#16150F',
  inkMuted: '#4A463C',
  inkFaint: '#6B6659',
  hairline: '#E4E0D6',
  hairlineStrong: '#D6D1C4',
  yours: '#14634E',
  rented: '#4A3FD0',
  alert: '#8C3A1E',
  transparent: 'transparent',
} as const;

export const darkColors = {
  ground: '#13120F',
  surface: '#1B1A16',
  ink: '#F4F1EC',
  inkMuted: '#B8B3A8',
  inkFaint: '#8F8A7E',
  hairline: '#2C2A24',
  hairlineStrong: '#3A382F',
  yours: '#3FCF8E',
  rented: '#8F86FF',
  alert: '#E08A66',
  transparent: 'transparent',
} as const;

export type OrbitColors = typeof lightColors | typeof darkColors;

/** Light-only compatibility export. New UI must use useOrbitTheme(). */
export const colors = {
  ...lightColors,
  paper: lightColors.ground,
  paperRaised: lightColors.surface,
  inkSoft: lightColors.inkMuted,
  line: lightColors.hairline,
  moss: lightColors.yours,
  mossLight: lightColors.surface,
  ember: lightColors.alert,
  emberLight: lightColors.surface,
  blue: lightColors.rented,
  blueLight: lightColors.surface,
  danger: lightColors.alert,
  white: lightColors.surface,
} as const;

export const useOrbitTheme = (): { colors: OrbitColors; dark: boolean } => {
  const dark = useColorScheme() === 'dark';
  return { colors: dark ? darkColors : lightColors, dark };
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  content: 20,
  xl: 26,
  xxl: 32,
  hero: 44,
} as const;

export const radii = {
  sm: 4,
  md: 4,
  lg: 6,
  pill: 4,
} as const;

export const motion = {
  fastMs: 180,
  deliberateMs: 700,
  curve: [0.2, 0.85, 0.2, 1] as const,
} as const;
