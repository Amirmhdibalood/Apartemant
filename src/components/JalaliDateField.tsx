import { MONTHS } from '../models/constants';
import { IconCalendar, IconChevronDown, IconX } from './Icons';
import { formatJalaliKey, jalaliMonthLength, parseJalaliKey, type JalaliDate } from '../logic/jalali';

interface Props {
  id: string;
  label: string;
  /** متن راهنما زیر برچسب (مثلاً «آخرین مهلت پرداخت») */
  hint?: string;
  optional?: boolean;
  /** "1405-07-15" یا null (= بدون تاریخ) */
  value: string | null;
  onChange: (value: string | null) => void;
  /** تاریخ پیش‌فرض هنگام زدن دکمه افزودن */
  defaultDate: JalaliDate;
  /** سال‌های قابل انتخاب */
  years: number[];
  addLabel?: string;
  /** امکان حذف تاریخ (برای فیلد اختیاری) */
  clearable?: boolean;
}

/** انتخاب تاریخ شمسی (روز / ماه / سال) با همان ظاهر کشوهای برنامه */
export function JalaliDateField({ id, label, hint, optional, value, onChange, defaultDate, years, addLabel, clearable = true }: Props) {
  const d = parseJalaliKey(value);
  const set = (next: JalaliDate) => {
    const day = Math.min(next.day, jalaliMonthLength(next.year, next.month));
    onChange(formatJalaliKey({ ...next, day }));
  };
  const yearList = d && !years.includes(d.year) ? [...years, d.year].sort((a, b) => a - b) : years;

  const sel = (key: 'day' | 'month' | 'year', aria: string, options: { value: number; label: string }[]) => (
    <div className="select-wrap">
      <select
        id={`${id}-${key}`}
        className="input select"
        aria-label={`${label} — ${aria}`}
        value={d ? d[key] : ''}
        onChange={(e) => d && set({ ...d, [key]: Number(e.target.value) })}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <IconChevronDown size={16} className="select-chevron" />
    </div>
  );

  return (
    <div className="field date-field">
      <span className="field__label" id={`${id}-label`}>
        {label} {optional && <span className="field__optional">(اختیاری)</span>}
      </span>
      {hint && <p className="field__hint">{hint}</p>}
      {d ? (
        <div className="date-field__row" role="group" aria-labelledby={`${id}-label`}>
          {sel('day', 'روز', Array.from({ length: jalaliMonthLength(d.year, d.month) }, (_, i) => ({ value: i + 1, label: String(i + 1) })))}
          {sel('month', 'ماه', MONTHS.map((m, i) => ({ value: i + 1, label: m })))}
          {sel('year', 'سال', yearList.map((y) => ({ value: y, label: String(y) })))}
          {clearable && (
            <button type="button" className="icon-btn date-field__clear" aria-label={`حذف ${label}`} onClick={() => onChange(null)}>
              <IconX size={18} />
            </button>
          )}
        </div>
      ) : (
        <button type="button" id={id} className="btn btn--soft btn--block date-field__add" onClick={() => set(defaultDate)}>
          <IconCalendar size={18} />
          <span>{addLabel ?? `تعیین ${label}`}</span>
        </button>
      )}
    </div>
  );
}
