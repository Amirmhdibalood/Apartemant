import { useId, useRef, useState } from 'react';
import { IconCheck, IconChevronDown } from './Icons';
import { Popover } from './Popover';
import { toPersianDigits } from '../logic/formatting';
import { ALL_LABEL } from '../logic/billFilter';
import { multiSummary } from '../logic/multiFilter';

export interface MultiOption<T> { value: T; label: string; /** انتخاب این گزینه بقیه را برمی‌دارد (مثل «حذف‌شده») */ exclusive?: boolean }

interface Props<T> {
  id: string;
  label: string;
  /** واحد شمارش در خلاصه، مثل «ماه» → «۲ ماه (مهر، آبان)» */
  unit: string;
  /** انتخاب‌شده‌ها؛ خالی = «همه» (بدون فیلتر) */
  value: T[];
  options: MultiOption<T>[];
  onChange: (v: T[]) => void;
  /** گزینهٔ «همه» در بالای فهرست (پیش‌فرض: دارد) */
  withAll?: boolean;
}

/**
 * انتخاب چندتایی (۱.۹) با فهرست شناور: «همه» یا هیچ‌کدام = بدون فیلتر. با هر تیک باز می‌ماند؛
 * لمس بیرون یا لمس دوبارهٔ فیلد آن را می‌بندد. گزینهٔ انحصاری (مثل «حذف‌شده») با بقیه جمع نمی‌شود.
 */
export function MultiOptionPicker<T extends string | number>({ id, label, unit, value, options, onChange, withAll = true }: Props<T>) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const known = value.filter((v) => options.some((o) => o.value === v));
  const all = known.length === 0;
  const summary = multiSummary(known.map((v) => options.find((o) => o.value === v)!.label), unit);

  const toggle = (o: MultiOption<T>) => {
    const on = known.includes(o.value);
    if (on) { onChange(known.filter((v) => v !== o.value)); return; }
    if (o.exclusive) { onChange([o.value]); return; }
    const rest = known.filter((v) => !options.find((x) => x.value === v)?.exclusive);
    const next = [...rest, o.value];
    // همه تیک خورد = «همه»
    onChange(next.length === options.filter((x) => !x.exclusive).length ? [] : options.map((x) => x.value).filter((v) => next.includes(v)));
  };

  return (
    <div className="field select-field">
      <div className={'year-picker option-picker multi-picker' + (open ? ' is-open' : '')}>
        <button
          ref={anchorRef}
          type="button"
          id={id}
          className="year-picker__toggle"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-label={`${label}: ${all ? ALL_LABEL : summary}`}
          onClick={() => setOpen((x) => !x)}
        >
          <span className="year-picker__text">
            <span className="year-picker__label">
              {label}
              {!all && <span className="year-picker__count">{toPersianDigits(known.length)}</span>}
            </span>
            <span className="year-picker__value">{all ? ALL_LABEL : toPersianDigits(summary)}</span>
          </span>
          <IconChevronDown size={22} className="year-picker__chevron" />
        </button>
        <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} id={listId} role="group" ariaLabel={label} ariaMultiselectable minWidth={170}>
          {withAll && (
            <button type="button" role="checkbox" aria-checked={all} className={'year-row year-row--all' + (all ? ' is-active' : '')} onClick={() => onChange([])}>
              <span className="year-row__box" aria-hidden="true">{all && <IconCheck size={15} strokeWidth={3} />}</span>
              <span className="year-row__year">{ALL_LABEL}</span>
            </button>
          )}
          {options.map((o) => {
            const on = known.includes(o.value);
            return (
              <button type="button" role="checkbox" aria-checked={on} key={String(o.value)} className={'year-row' + (on ? ' is-active' : '') + (o.exclusive ? ' year-row--exclusive' : '')} onClick={() => toggle(o)}>
                <span className="year-row__box" aria-hidden="true">{on && <IconCheck size={15} strokeWidth={3} />}</span>
                <span className="year-row__year">{toPersianDigits(o.label)}</span>
                {o.exclusive && <span className="year-row__status">جدا</span>}
              </button>
            );
          })}
        </Popover>
      </div>
    </div>
  );
}
