import type { ReactNode } from 'react';
import { IconChevronLeft, IconHelp } from './Icons';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  title: string;
  onBack?: () => void;
  /** دکمه/آیکون سمت راست عنوان (مثل تقویم در صفحه سوابق) */
  start?: ReactNode;
  /** دکمه «؟» (راهنما/آموزش) در سمت چپ نوار بالا (از نسخه ۱.۶.۳) */
  onHelp?: () => void;
}

/** دکمه «؟» راهنما: باز کردن آموزش (جایگزین زبانه آموزش در نوار پایین) */
export function HelpButton({ onHelp }: { onHelp: () => void }) {
  return (
    <button type="button" className="icon-btn help-btn" onClick={onHelp} aria-label="راهنما (آموزش)">
      <IconHelp size={24} />
    </button>
  );
}

/** هدر صفحات: عنوان وسط، دکمه بازگشت سمت چپ (مطابق تصویر مرجع)؛ «؟» دورترین دکمه سمت چپ */
export function AppHeader({ title, onBack, start, onHelp }: Props) {
  const two = !!onBack && !!onHelp;
  return (
    <header className={'app-header' + (onHelp ? ' app-header--help' : '') + (two ? ' app-header--two' : '')}>
      <div className="app-header__side app-header__start">{start}</div>
      <h1 className="app-header__title">{title}</h1>
      <div className="app-header__side app-header__end">
        {onBack && (
          <button type="button" className="icon-btn" onClick={onBack} aria-label="بازگشت">
            <IconChevronLeft size={24} />
          </button>
        )}
        {onHelp && <HelpButton onHelp={onHelp} />}
        {onHelp && <ThemeToggle />}
      </div>
    </header>
  );
}
