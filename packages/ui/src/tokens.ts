export const colors = {
  ink: '#11110F',
  inkSoft: '#3C3B36',
  paper: '#F6F2E9',
  paperRaised: '#FFFCF5',
  line: '#D9D1C3',
  moss: '#48624E',
  mossLight: '#DDE7DA',
  ember: '#C85B38',
  emberLight: '#F4DED5',
  blue: '#436B8B',
  blueLight: '#DCE8F0',
  gold: '#B78A2F',
  danger: '#9C3F3F',
  white: '#FFFFFF',
  transparent: 'transparent',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  hero: 48,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: '#11110F',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
} as const;
