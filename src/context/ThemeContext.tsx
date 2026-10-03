import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { adaptThemeColor } from '../logic/themeColor';
import { resolveTheme, themeMetaColor, toggleTheme, type Theme } from '../logic/theme';
import { DEFAULT_DARK_PALETTE, sanitizeDarkPalette, type DarkPaletteId } from '../logic/darkPalettes';
import { DEFAULT_LIGHT_PALETTE, sanitizeLightPalette, type LightPaletteId } from '../logic/lightPalettes';
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
  /** پالت تم روشن (در حالت تاریک هم نگه داشته می‌شود) */
  lightPalette: LightPaletteId;
  /** انتخاب پالت روشن: همان لحظه اعمال و ذخیره می‌شود و حالت هم «روشن» می‌شود */
  setLightPalette: (p: LightPaletteId) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
/** آخرین پالت‌های اعمال‌شده (آینهٔ سبک در localStorage) برای رنگ‌آمیزی اول بدون پرش؛ مقدار نامعتبر = پیش‌فرض */
function readMirror(): { palette: DarkPaletteId; light: LightPaletteId } {
  try {
    const m = JSON.parse(localStorage.getItem('bc.themeMirror') ?? 'null');
    if (Array.isArray(m)) return { palette: sanitizeDarkPalette(m[1]) ?? DEFAULT_DARK_PALETTE, light: sanitizeLightPalette(m[2]) ?? DEFAULT_LIGHT_PALETTE };
  } catch { /* ignore */ }
  return { palette: DEFAULT_DARK_PALETTE, light: DEFAULT_LIGHT_PALETTE };
}
const systemPrefersDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** اعمال تم روی صفحه: ویژگی data-theme، رنگ meta و (روی اندروید) آیکون‌های نوار وضعیت/ناوبری — بدون هیچ مجوزی */
function applyTheme(theme: Theme, palette: DarkPaletteId, lightPalette: LightPaletteId) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.palette = palette;
  document.documentElement.dataset.light = lightPalette;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeMetaColor(theme, palette, lightPalette));
  // آینهٔ سبک برای نخستین رنگ‌آمیزی بعدی (اسکریپت index.html قبل از بارگذاری React می‌خواند)؛ منبع اصلی همچنان kvStore است
  try { localStorage.setItem('bc.themeMirror', JSON.stringify([theme, palette, lightPalette])); } catch { /* ignore */ }
  if (Capacitor.isNativePlatform()) {
    void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<Theme | null>(null);
  const [palette, setPaletteState] = useState<DarkPaletteId>(() => readMirror().palette);
  const [lightPalette, setLightPaletteState] = useState<LightPaletteId>(() => readMirror().light);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const theme = resolveTheme(stored, systemDark);

  useEffect(() => {
    let alive = true;
    themeRepository.get().then((t) => { if (alive && t) setStored(t); }).catch(() => undefined);
    themeRepository.getPalette().then((p) => { if (alive) setPaletteState(p); }).catch(() => undefined);
    themeRepository.getLightPalette().then((p) => { if (alive) setLightPaletteState(p); }).catch(() => undefined);
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

  useEffect(() => { applyTheme(theme, palette, lightPalette); }, [theme, palette, lightPalette]);

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

  const setLightPalette = useCallback((p: LightPaletteId) => {
    setLightPaletteState(p);
    void themeRepository.saveLightPalette(p).catch(() => undefined);
    setStored('light');
    void themeRepository.save('light').catch(() => undefined);
  }, []);

  return <Ctx.Provider value={{ theme, palette, toggle, setTheme, setPalette, lightPalette, setLightPalette }}>{children}</Ctx.Provider>;
}

/** رنگ درون‌خطی متناسب با تم فعلی (در حالت روشن بدون تغییر) */
export function useAdapt(): (hex: string) => string {
  const { theme, palette, lightPalette } = useTheme();
  return (hex: string) => adaptThemeColor(hex, theme, palette, lightPalette);
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme must be used inside ThemeProvider');
  return c;
}
