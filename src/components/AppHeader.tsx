import type { ReactNode } from 'react';
import { IconChevronLeft, IconHeadset } from './Icons';
import { NotifBell } from './NotifBell';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  title: string;
  onBack?: () => void;
  /** دکمه/آیکون سمت راست عنوان (مثل تقویم در صفحه سوابق) */
  start?: ReactNode;
  /** فقط چهار صفحهٔ اصلی نوار پایین (خانه، سوابق، گزارش‌ها، تنظیمات): با این پارامتر «پشتیبانی» و زنگوله (اعلان) هم دیده می‌شوند */
  onSupport?: () => void;
}

/** دکمهٔ «پشتیبانی» (آیکن هدست): سؤال‌های رایج و راه‌های تماس */
export function SupportButton({ onSupport }: { onSupport: () => void }) {
  return (
    <button type="button" className="icon-btn support-btn" onClick={onSupport} aria-label="پشتیبانی">
      <IconHeadset size={24} />
    </button>
  );
}

/**
 * هدر صفحات (از ۱.۷.۸ بدون دکمهٔ «؟»؛ آموزش از دکمهٔ «آموزش» صفحهٔ اصلی باز می‌شود).
 *  - صفحه‌های داخلی: فقط بازگشت + دکمهٔ تم.
 *  - چهار صفحهٔ اصلی (onSupport داده شود): زنگوله (اعلان)، پشتیبانی و تم (و بازگشت اگر لازم باشد).
 * ترتیب فیزیکی از چپ به راست: بازگشت ← تم ← پشتیبانی ← زنگوله (صفحه راست‌به‌چپ است، پس در DOM برعکس نوشته می‌شود).
 */
export function AppHeader({ title, onBack, start, onSupport }: Props) {
  const main = !!onSupport;
  return (
    <header className={'app-header app-header--two' + (main ? ' app-header--main' : '')}>
      <div className="app-header__side app-header__start">{start}</div>
      <h1 className="app-header__title">{title}</h1>
      <div className="app-header__side app-header__end">
        {main && <NotifBell />}
        {main && <SupportButton onSupport={onSupport!} />}
        <ThemeToggle />
        {onBack && (
          <button type="button" className="icon-btn" onClick={onBack} aria-label="بازگشت">
            <IconChevronLeft size={24} />
          </button>
        )}
      </div>
    </header>
  );
}
