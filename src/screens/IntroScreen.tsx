import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { useTheme } from '../context/ThemeContext';
import { introArtFor } from './introArt';

/** مدت نمایش صفحه ورود (میلی‌ثانیه) و مدت محوشدن */
export const INTRO_DURATION_MS = 1800;
const FADE_MS = 350;

interface Props {
  onDone: () => void;
}

/**
 * صفحه ورود (اسپلش داخل برنامه): تصویر آسمان و ساختمان‌ها (طرح ۱) با عنوان و نام برنامه.
 * حدود ۱٫۸ ثانیه نمایش داده می‌شود و سپس به خانه می‌رود؛ با لمس صفحه زودتر رد می‌شود.
 * کاملاً آفلاین: تصویر و فونت داخل بسته برنامه هستند.
 */
export function IntroScreen({ onDone }: Props) {
  const { theme, palette } = useTheme();
  const art = introArtFor(theme === 'dark', palette);
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setLeaving(true);
    window.setTimeout(onDone, FADE_MS);
  };

  useEffect(() => {
    // اسپلش بومی اندروید را به محض آماده شدن صفحه ورود پنهان کن تا انتقال یکپارچه باشد
    if (Capacitor.isNativePlatform()) void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => undefined);
    const t = window.setTimeout(finish, INTRO_DURATION_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={'intro' + (leaving ? ' intro-leave' : '')}
      role="button"
      tabIndex={0}
      aria-label="محاسبه شارژ ساختمان — آپارتمانت"
      onClick={finish}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') finish(); }}
    >
      <picture>
        <source media="(orientation: landscape)" srcSet={art.landscape} />
        <img className="intro-art" src={art.portrait} alt="" draggable={false} />
      </picture>
      <div className="intro-text">
        <h1 className="intro-title">محاسبه شارژ ساختمان</h1>
        <span className="intro-bar" aria-hidden="true" />
        <p className="intro-subtitle">آپارتمانت</p>
      </div>
    </div>
  );
}
