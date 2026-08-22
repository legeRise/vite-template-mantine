import { createTheme, rem } from '@mantine/core';

export const appThemeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'forest', label: 'Forest' },
  { value: 'aurora', label: 'Aurora' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'sunset', label: 'Sunset', hidden: true },
] as const;

export type AppThemeOption = (typeof appThemeOptions)[number];
export type AppThemeName = AppThemeOption['value'];
export const defaultAppTheme: AppThemeName = 'light';

export const themeTokens: Record<
  AppThemeName,
  {
    'bg-canvas': string;
    'surface-1': string;
    'surface-2': string;
    'surface-3': string;
    line: string;
    'line-strong': string;
    'text-primary': string;
    'text-secondary': string;
    'text-muted': string;
    accent: string;
    'accent-b': string;
    'accent-dim': string;
    danger: string;
    'header-bg': string;
  }
> = {
  light: {
    'bg-canvas': '#faf9fc',
    'surface-1': '#ffffff',
    'surface-2': '#f5f3fa',
    'surface-3': '#ece9f5',
    line: 'rgba(23, 17, 45, 0.09)',
    'line-strong': 'rgba(23, 17, 45, 0.16)',
    'text-primary': '#171325',
    'text-secondary': '#615d74',
    'text-muted': '#918da3',
    accent: '#6552e8',
    'accent-b': '#5642d6',
    'accent-dim': 'rgba(101, 82, 232, 0.1)',
    danger: '#c8443b',
    'header-bg': 'rgba(255, 255, 255, 0.72)',
  },
  dark: {
    'bg-canvas': '#0a0a0f',
    'surface-1': '#131319',
    'surface-2': '#1b1b24',
    'surface-3': '#24242f',
    line: 'rgba(255, 255, 255, 0.08)',
    'line-strong': 'rgba(255, 255, 255, 0.16)',
    'text-primary': '#f4f3fa',
    'text-secondary': '#9c9bae',
    'text-muted': '#68677a',
    accent: '#7c6cf6',
    'accent-b': '#9f86fa',
    'accent-dim': 'rgba(124, 108, 246, 0.16)',
    danger: '#f08585',
    'header-bg': 'rgba(27, 27, 36, 0.78)',
  },
  midnight: {
    'bg-canvas': '#090b12',
    'surface-1': '#111827',
    'surface-2': '#182133',
    'surface-3': '#1f2b42',
    line: 'rgba(145, 170, 255, 0.14)',
    'line-strong': 'rgba(145, 170, 255, 0.22)',
    'text-primary': '#edf3ff',
    'text-secondary': '#9aaed0',
    'text-muted': '#6c7ca3',
    accent: '#7aa2ff',
    'accent-b': '#93b8ff',
    'accent-dim': 'rgba(122, 162, 255, 0.16)',
    danger: '#ff8ea8',
    'header-bg': 'rgba(17, 24, 39, 0.78)',
  },
  sunset: {
    'bg-canvas': '#140d11',
    'surface-1': '#211518',
    'surface-2': '#321d22',
    'surface-3': '#492a2f',
    line: 'rgba(255, 191, 160, 0.16)',
    'line-strong': 'rgba(255, 191, 160, 0.24)',
    'text-primary': '#fff1ec',
    'text-secondary': '#e4b7a8',
    'text-muted': '#c58f88',
    accent: '#ff8a65',
    'accent-b': '#ffb38a',
    'accent-dim': 'rgba(255, 138, 101, 0.16)',
    danger: '#ff6b6b',
    'header-bg': 'rgba(50, 29, 34, 0.78)',
  },
  forest: {
    'bg-canvas': '#09120f',
    'surface-1': '#101d1a',
    'surface-2': '#162d27',
    'surface-3': '#1d3b35',
    line: 'rgba(137, 226, 192, 0.14)',
    'line-strong': 'rgba(137, 226, 192, 0.22)',
    'text-primary': '#ebfff7',
    'text-secondary': '#a3d7be',
    'text-muted': '#78a98b',
    accent: '#53d69a',
    'accent-b': '#8ae7be',
    'accent-dim': 'rgba(83, 214, 154, 0.18)',
    danger: '#ff8b7b',
    'header-bg': 'rgba(22, 45, 39, 0.78)',
  },
  aurora: {
    'bg-canvas': '#0b1018',
    'surface-1': '#101a24',
    'surface-2': '#152d38',
    'surface-3': '#1a3a4a',
    line: 'rgba(149, 233, 255, 0.15)',
    'line-strong': 'rgba(149, 233, 255, 0.22)',
    'text-primary': '#ecffff',
    'text-secondary': '#9fd7d9',
    'text-muted': '#73aeb2',
    accent: '#5fe0d3',
    'accent-b': '#9cf1e7',
    'accent-dim': 'rgba(95, 224, 211, 0.17)',
    danger: '#ff9eb3',
    'header-bg': 'rgba(21, 45, 56, 0.78)',
  },
} as const;

export const uiFont =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const monoFont = 
  'ui-monospace, "SF Mono", "Cascadia Code", "Consolas", monospace';

export const getThemeVars = (mode: AppThemeName) =>
  Object.entries(themeTokens[mode]).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [`--ez-${key}`]: value,
    }),
    {} as Record<string, string>
  );

const brandPalettes: Record<AppThemeName, [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
]> = {
  light: ['#f7f3ff', '#efe8ff', '#e2d8ff', '#cbbcff', '#b5a2ff', '#9a84ff', '#7d64f4', '#6951df', '#4f3ec1', '#3f2ea1'],
  dark: ['#f1effe', '#e4defc', '#d0c7fa', '#b7a9f7', '#9f8bf3', '#7c6cf6', '#6a57ee', '#5a46d8', '#4c3aba', '#3e2f99'],
  midnight: ['#edf5ff', '#ddeaff', '#c5d9ff', '#a9c4ff', '#8aaaef', '#7aa2ff', '#678ae6', '#5372ca', '#405fae', '#324d8c'],
  sunset: ['#fff3ee', '#ffe4d8', '#ffd7c0', '#ffc19a', '#ffad7d', '#ff8a65', '#ef744f', '#d75f3d', '#b74d2a', '#8f3c20'],
  forest: ['#edfef6', '#d9f9eb', '#c3f1dc', '#9fe8c9', '#7ddbb0', '#53d69a', '#3fc589', '#2ca773', '#208b60', '#1b724e'],
  aurora: ['#ebffff', '#d7fdfd', '#c0fbfb', '#9feef2', '#7fe1e9', '#5fe0d3', '#4ac8ba', '#39ac9d', '#2c8f82', '#246e69'],
};

export const getBrandPalette = (mode: AppThemeName) => brandPalettes[mode];

export const buildMantineTheme = (mode: AppThemeName) =>
  createTheme({
    primaryColor: 'brand',
    colors: { brand: getBrandPalette(mode) },
    fontFamily: uiFont,
    fontFamilyMonospace: monoFont,
    fontSizes: {
      xs: rem(11),
      sm: rem(12.5),
      md: rem(13.5),
      lg: rem(15),
      xl: rem(20),
    },
    headings: {
      fontWeight: '700',
      sizes: {
        h1: { fontSize: rem(29) },
        h2: { fontSize: rem(24) },
        h3: { fontSize: rem(20) },
        h4: { fontSize: rem(15) },
      },
    },
    radius: {
      xs: rem(6),
      sm: rem(9),
      md: rem(9),
      lg: rem(14),
      xl: rem(20),
    },
    shadows: {
      xs: '0 1px 3px rgba(0,0,0,0.18)',
      sm: '0 2px 8px rgba(0,0,0,0.22)',
      md: '0 8px 28px rgba(0,0,0,0.30)',
      lg: '0 16px 48px rgba(0,0,0,0.36)',
      xl: '0 24px 64px rgba(0,0,0,0.42)',
      brand: `0 0 0 1px ${themeTokens[mode]['accent-dim']}, 0 8px 24px ${themeTokens[mode]['accent-dim']}`,
    },
    cursorType: 'pointer',
    respectReducedMotion: true,
    defaultRadius: 'md',
  });

export const theme = buildMantineTheme(defaultAppTheme);
