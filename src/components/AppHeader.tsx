import type { ReactNode } from 'react';
import { IconChevronLeft } from './Icons';

interface Props {
  title: string;
  onBack?: () => void;
  /** دکمه/آیکون سمت راست عنوان (مثل تقویم در صفحه سوابق) */
  start?: ReactNode;
}

/** هدر صفحات: عنوان وسط، دکمه بازگشت سمت چپ (مطابق تصویر مرجع) */
export function AppHeader({ title, onBack, start }: Props) {
  return (
    <header className="app-header">
      <div className="app-header__side app-header__start">{start}</div>
      <h1 className="app-header__title">{title}</h1>
      <div className="app-header__side app-header__end">
        {onBack && (
          <button type="button" className="icon-btn" onClick={onBack} aria-label="بازگشت">
            <IconChevronLeft size={24} />
          </button>
        )}
      </div>
    </header>
  );
}
