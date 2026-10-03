import { IconMoon, IconSun } from './Icons';
import { useTheme } from '../context/ThemeContext';

/** دکمه ماه/خورشید کنار «؟» در بالا-چپ: تغییر حالت روشن/تاریک */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button type="button" className="icon-btn theme-btn" onClick={toggle} aria-label={dark ? 'حالت روشن' : 'حالت تاریک'} aria-pressed={dark} title={dark ? 'حالت روشن' : 'حالت تاریک'}>
      {dark ? <IconSun size={23} /> : <IconMoon size={23} />}
    </button>
  );
}
