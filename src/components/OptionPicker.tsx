import { useEffect, useId, useRef, useState } from 'react';
import { IconCheck, IconChevronDown } from './Icons';
import { toPersianDigits } from '../logic/formatting';

export interface PickerOption { value: number; label: string }

interface Props {
  id: string;
  label: string;
  value: number;
  options: PickerOption[];
  onChange: (v: number) => void;
  /** برچسب خوانا برای فناوری‌های کمکی (پیش‌فرض: label) */
  ariaLabel?: string;
  /** کلاس اضافه روی ریشه (مثلاً برای چیدمان در فرم تاریخ) */
  className?: string;
}

/**
 * انتخابگر تک‌گزینه‌ای با همان ظاهر و رفتار «سال‌های فعال» در تنظیمات (YearPicker):
 * سربرگ کشویی (برچسب + مقدار فعلی + فلش) و فهرست قابل اسکرول که با انتخاب یک گزینه بسته می‌شود.
 * همان کلاس‌های `year-picker` / `year-row` را دوباره استفاده می‌کند تا ظاهر کاملاً یکسان بماند.
 */
export function OptionPicker({ id, label, value, options, onChange, ariaLabel, className }: Props) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const fmt = (s: string) => toPersianDigits(s); // ارقام فارسی مثل «سال‌های فعال»
  const current = options.find((o) => o.value === value);

  // با باز شدن فهرست، گزینه انتخاب‌شده در دید قرار می‌گیرد
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('.is-active');
    if (el && listRef.current) listRef.current.scrollTop = Math.max(0, el.offsetTop - 60);
  }, [open]);

  return (
    <div className={'year-picker option-picker' + (open ? ' is-open' : '') + (className ? ' ' + className : '')}>
      <button
        type="button"
        id={id}
        className="year-picker__toggle"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${ariaLabel ?? label}: ${current ? fmt(current.label) : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="year-picker__text">
          <span className="year-picker__label">{label}</span>
          <span className="year-picker__value">{current ? fmt(current.label) : '—'}</span>
        </span>
        <IconChevronDown size={22} className="year-picker__chevron" />
      </button>
      {open && (
        <div ref={listRef} id={listId} className="year-picker__list" role="radiogroup" aria-label={ariaLabel ?? label}>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={on}
                key={o.value}
                className={'year-row' + (on ? ' is-active' : '')}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                <span className="year-row__box" aria-hidden="true">{on && <IconCheck size={15} strokeWidth={3} />}</span>
                <span className="year-row__year">{fmt(o.label)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
