import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { adaptColor } from '../logic/darkColor';
import { resolveTheme, themeMetaColor, toggleTheme, type Theme } from '../logic/theme';
import { DEFAULT_DARK_PALETTE, type DarkPaletteId } from '../logic/darkPalettes';
import { themeRepository } from '../storage/themeRepository';

interface ThemeCtx {
  theme: Theme;
  /** پالت تم تاریک (در حالت روشن هم نگه داشته می‌شود تا با برگشت به تاریک همان بیاید) */
  palette: DarkPaletteId;
  toggle: () => void;
  /** تعیین مستقیم حالت (انتخابگر «تم» در تنظیمات) */
  setTheme: (t: Theme) => void;
  /** انتخاب پالت تاریک: همان لحظه اعمال و ذخیره می‌شود و حالت هم «تاریک» می‌شود */
  setPalette: (p: DarkPaletteId) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const systemPrefersDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** اعمال تم روی صفحه: ویژگی data-theme، رنگ meta و (روی اندروید) آیکون‌های نوار وضعیت/ناوبری — بدون هیچ مجوزی */
function applyTheme(theme: Theme, palette: DarkPaletteId) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.palette = palette;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeMetaColor(theme, palette));
  if (Capacitor.isNativePlatform()) {
    void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Theme | null>(null);
  const [palette, setPaletteState] = useState<DarkPaletteId>(DEFAULT_DARK_PALETTE);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const theme = resolveTheme(stored, systemDark);

  useEffect(() => {
    let alive = true;
    themeRepository.get().then((t) => { if (alive && t) setStored(t); }).catch(() => undefined);
    themeRepository.getPalette().then((p) => { if (alive) setPaletteState(p); }).catch(() => undefined);
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

  useEffect(() => { applyTheme(theme, palette); }, [theme, palette]);

  const toggle = useCallback(() => {
    const next = toggleTheme(theme);
    setStored(next);
    void themeRepository.save(next).catch(() => undefined);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setStored(t);
    void themeRepository.save(t).catch(() => undefined);
  }, []);

  const setPalette = useCallback((p: DarkPaletteId) => {
    setPaletteState(p);
    void themeRepository.savePalette(p).catch(() => undefined);
    setStored('dark');
    void themeRepository.save('dark').catch(() => undefined);
  }, []);

  return <Ctx.Provider value={{ theme, palette, toggle, setTheme, setPalette }}>{children}</Ctx.Provider>;
}

/** رنگ درون‌خطی متناسب با تم فعلی (در حالت روشن بدون تغییر) */
export function useAdapt(): (hex: string) => string {
  const { theme, palette } = useTheme();
  return (hex: string) => adaptColor(hex, theme, palette);
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme must be used inside ThemeProvider');
  return c;
}
