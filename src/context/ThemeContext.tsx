import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { adaptColor } from '../logic/darkColor';
import { resolveTheme, THEME_META_COLORS, toggleTheme, type Theme } from '../logic/theme';
import { themeRepository } from '../storage/themeRepository';

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const systemPrefersDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** اعمال تم روی صفحه: ویژگی data-theme، رنگ meta و (روی اندروید) آیکون‌های نوار وضعیت/ناوبری — بدون هیچ مجوزی */
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_META_COLORS[theme]);
  if (Capacitor.isNativePlatform()) {
    void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Theme | null>(null);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const theme = resolveTheme(stored, systemDark);

  useEffect(() => {
    let alive = true;
    themeRepository.get().then((t) => { if (alive && t) setStored(t); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  // تغییر تم سیستم تا وقتی کاربر خودش انتخاب نکرده، دنبال می‌شود
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const toggle = useCallback(() => {
    const next = toggleTheme(theme);
    setStored(next);
    void themeRepository.save(next).catch(() => undefined);
  }, [theme]);

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

/** رنگ درون‌خطی متناسب با تم فعلی (در حالت روشن بدون تغییر) */
export function useAdapt(): (hex: string) => string {
  const { theme } = useTheme();
  return (hex: string) => adaptColor(hex, theme);
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme must be used inside ThemeProvider');
  return c;
}
