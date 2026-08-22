import '@mantine/core/styles.css';

import {
  ColorSchemeScript,
  MantineProvider,
  localStorageColorSchemeManager,
  useMantineColorScheme,
} from '@mantine/core';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Router } from './Router';
import { VideoFlowProvider } from './studio/VideoFlowContext';
import {
  appThemeOptions,
  buildMantineTheme,
  defaultAppTheme,
  getThemeVars,
  type AppThemeName,
} from './theme';
import './global.css';

const colorSchemeManager = localStorageColorSchemeManager({
  key: 'ezclip-color-scheme',
});

const AppThemeContext = createContext<{
  theme: AppThemeName;
  setTheme: (nextTheme: AppThemeName) => void;
} | null>(null);

function getStoredTheme(): AppThemeName {
  if (typeof window === 'undefined') {
    return defaultAppTheme;
  }

  const stored = window.localStorage.getItem('ezclip-app-theme');
  return appThemeOptions.some((option) => option.value === stored)
    ? (stored as AppThemeName)
    : defaultAppTheme;
}

export function useAppTheme() {
  const value = useContext(AppThemeContext);

  if (!value) {
    throw new Error('useAppTheme must be used within AppThemeContext.Provider');
  }

  return value;
}

function ThemeCssVars() {
  const { theme: activeTheme } = useAppTheme();
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  useEffect(() => {
    const nextMantineScheme = activeTheme === 'light' ? 'light' : 'dark';
    if (colorScheme !== nextMantineScheme) {
      setColorScheme(nextMantineScheme);
    }
  }, [activeTheme, colorScheme, setColorScheme]);

  useEffect(() => {
    const vars = getThemeVars(activeTheme);
    const root = document.documentElement;
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [activeTheme]);

  return null;
}

export default function App() {
  const [appTheme, setAppTheme] = useState<AppThemeName>(getStoredTheme);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ezclip-app-theme', appTheme);
    }
  }, [appTheme]);

  const themeValue = useMemo(
    () => ({
      theme: appTheme,
      setTheme: setAppTheme,
    }),
    [appTheme]
  );

  return (
    <AppThemeContext.Provider value={themeValue}>
      <ColorSchemeScript defaultColorScheme="auto" />
      <MantineProvider
        colorSchemeManager={colorSchemeManager}
        defaultColorScheme="auto"
        theme={buildMantineTheme(appTheme)}
      >
        <ThemeCssVars />
        <VideoFlowProvider>
          <Router />
        </VideoFlowProvider>
      </MantineProvider>
    </AppThemeContext.Provider>
  );
}
