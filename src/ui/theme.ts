import { useColorScheme } from 'react-native';

/** App chrome colors (N-7). The canvas always keeps the user's chosen colors. */
const light = {
  bg: '#FFFFFF',
  surface: '#F4F4F6',
  surface2: '#E9E9EE',
  text: '#111114',
  textDim: '#6B6B73',
  border: '#E0E0E6',
  accent: '#D9432B',
  onAccent: '#FFFFFF',
  backdrop: '#ECECF0',
  danger: '#D62D20',
  selection: '#2F7BF6',
  overlay: 'rgba(0,0,0,0.4)',
};

const dark: typeof light = {
  bg: '#000000',
  surface: '#1C1C1E',
  surface2: '#2C2C2E',
  text: '#F5F5F7',
  textDim: '#9A9AA1',
  border: '#38383A',
  accent: '#FF5F45',
  onAccent: '#FFFFFF',
  backdrop: '#111113',
  danger: '#FF453A',
  selection: '#4C93FF',
  overlay: 'rgba(0,0,0,0.6)',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };

/** iPad shows a centered phone-width layout (N-5). */
export const MAX_CONTENT_WIDTH = 560;
