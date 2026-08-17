import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_TOKENS, LIGHT_TOKENS, ThemeTokens } from './tokens';

type ThemeMode = 'dark' | 'light';

interface ThemeState {
  mode: ThemeMode;
  theme: ThemeTokens;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'nest-theme-mode';

const ThemeContext = createContext<ThemeState | undefined>(undefined);

// Defaults to the device's system setting on first launch. Once a user
// explicitly toggles (Settings screen ships in a later phase), the choice
// is persisted and overrides the system default from then on.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(systemScheme === 'light' ? 'light' : 'dark');

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') setMode(stored);
    })();
  }, []);

  const toggleTheme = () => {
    setMode((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  };

  const value = useMemo<ThemeState>(
    () => ({
      mode,
      theme: mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS,
      toggleTheme,
    }),
    [mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
