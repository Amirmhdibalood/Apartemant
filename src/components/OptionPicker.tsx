import { useEffect, useId, useRef, useState } from 'react';
import { IconCheck, IconChevronDown } from './Icons';
import { Popover } from './Popover';
import { toPersianDigits } from '../logic/formatting';

/** مقدار گزینه: عدد (سال/ماه/…) یا رشته (مثلاً شناسهٔ ساختمان) */
export type PickerValue = string | number;
export interface PickerOption { value: PickerValue; label: string }

interface Props {
  id: string;
  label: string;
  value: PickerValue;
  options: PickerOption[];
  onChange: (v: PickerValue) => void;
  /** برچسب خوانا برای فناوری‌های کمکی (پیش‌فرض: label) */
  ariaLabel?: string;
  /** کلاس اضافه روی ریشه (مثلاً برای چیدمان در فرم تاریخ) */
  className?: string;
  /** متن کوتاه‌شدهٔ فیلد بسته (مثلاً نام ماه در فیلد تاریخ)؛ فهرست همیشه نام کامل را نشان می‌دهد */
  displayLabel?: (o: PickerOption) => string;
  /** کمترین پهنای فهرست شناور */
  popoverMinWidth?: number;
  /** برچسب بالای مقدار را نشان نده (فیلد تاریخ یک‌خطی) */
  hideLabel?: boolean;
}

/**
 * انتخابگر تک‌گزینه‌ای (از ۱.۹ با فهرست شناور Popover): سربرگ (برچسب + مقدار + فلش) ثابت می‌ماند و فهرست
 * روی صفحه باز می‌شود — بدون جابه‌جا شدن چیدمان. با انتخاب، لمس دوبارهٔ فیلد یا لمس بیرون بسته می‌شود.
 * کلاس‌های `year-picker` / `year-row` همان ظاهر قبلی را نگه می‌دارند.
 */
export function OptionPicker({ id, label, value, options, onChange, ariaLabel, className, displayLabel, popoverMinWidth = 150, hideLabel }: Props) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const fmt = (s: string) => toPersianDigits(s); // ارقام فارسی مثل «سال‌های فعال»
  const current = options.find((o) => o.value === value);
  const shown = current ? fmt(displayLabel ? displayLabel(current) : current.label) : '—';

  // با باز شدن فهرست، گزینه انتخاب‌شده در دید قرار می‌گیرد (فقط داخل فهرست، نه صفحه)
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      const list = document.getElementById(listId)?.querySelector<HTMLElement>('.popover__list');
      const el = list?.querySelector<HTMLElement>('.is-active');
      if (el && list) list.scrollTop = Math.max(0, el.offsetTop - 60);
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, listId]);

  return (
    <div className={'year-picker option-picker' + (open ? ' is-open' : '') + (className ? ' ' + className : '')}>
      <button
        ref={anchorRef}
        type="button"
        id={id}
        className="year-picker__toggle"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-label={`${ariaLabel ?? label}: ${current ? fmt(current.label) : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="year-picker__text">
          {!hideLabel && <span className="year-picker__label">{label}</span>}
          <span className="year-picker__value">{shown}</span>
        </span>
        <IconChevronDown size={22} className="year-picker__chevron" />
      </button>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} id={listId} role="radiogroup" ariaLabel={ariaLabel ?? label} minWidth={popoverMinWidth}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={on}
              key={String(o.value)}
              className={'year-row' + (on ? ' is-active' : '')}
              onClick={() => { onChange(o.value); setOpen(false); anchorRef.current?.focus({ preventScroll: true }); }}
            >
              <span className="year-row__box" aria-hidden="true">{on && <IconCheck size={15} strokeWidth={3} />}</span>
              <span className="year-row__year">{fmt(o.label)}</span>
            </button>
          );
        })}
      </Popover>
    </div>
  );
}
