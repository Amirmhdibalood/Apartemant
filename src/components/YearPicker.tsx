import { useId, useState } from 'react';
import { IconCheck, IconChevronDown } from './Icons';
import { toPersianDigits } from '../logic/formatting';
import { activeYearsSummary } from '../logic/years';

interface Props {
  years: number[];
  active: number[];
  onToggle: (year: number) => void;
}

/**
 * انتخاب سال‌های فعال به‌صورت کشویی (آکاردئون): با لمس سربرگ باز/بسته می‌شود و
 * داخل آن فهرست قابل اسکرول سال‌ها با چک‌باکس فعال/غیرفعال قرار دارد.
 */
export function YearPicker({ years, active, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <div className={'year-picker' + (open ? ' is-open' : '')}>
      <button
        type="button"
        className="year-picker__toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="year-picker__text">
          <span className="year-picker__label">
            سال‌های فعال
            <span className="year-picker__count">{toPersianDigits(active.length)}</span>
          </span>
          <span className="year-picker__value">{activeYearsSummary(active)}</span>
        </span>
        <IconChevronDown size={22} className="year-picker__chevron" />
      </button>
      {open && (
        <div id={listId} className="year-picker__list" role="group" aria-label="فهرست سال‌ها">
          {years.map((y) => {
            const on = active.includes(y);
            return (
              <label key={y} className={'year-row' + (on ? ' is-active' : '')}>
                <input type="checkbox" checked={on} onChange={() => onToggle(y)} aria-label={`سال ${toPersianDigits(y)}`} />
                <span className="year-row__box" aria-hidden="true">{on && <IconCheck size={15} strokeWidth={3} />}</span>
                <span className="year-row__year">{toPersianDigits(y)}</span>
                <span className="year-row__status">{on ? 'فعال' : 'غیرفعال'}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
