import { MONTHS } from '../models/constants';
import { IconCalendar, IconX } from './Icons';
import { OptionPicker } from './OptionPicker';
import { formatJalaliKey, jalaliMonthLength, jalaliWeekdayFa, parseJalaliKey, type JalaliDate } from '../logic/jalali';

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
  /** متن کنار روز هفته (مثلاً «۷ روز دیگر») */
  note?: string;
  /** خانه‌های خالی و غیرفعال (مثلاً «بدون تاریخ پایان») به‌جای دکمهٔ افزودن */
  disabled?: boolean;
}

/** نام ماه در خانهٔ بسته (کوتاه با «…» در CSS)؛ فهرست شناور نام کامل را نشان می‌دهد */
const monthOptions = MONTHS.map((m, i) => ({ value: i + 1, label: m }));

/**
 * انتخاب تاریخ شمسی یک‌خطی (۱.۹): روز | ماه | سال با پهنای برابر و روز هفته زیرش.
 * هر خانه فهرست شناور خودش را باز می‌کند (بدون جابه‌جایی صفحه).
 * زیر ۳۶۰ پیکسل قلم کوچک‌تر و بی‌فلش؛ زیر ۳۳۰ پیکسل برچسب‌های خانه‌ها یکی می‌شوند.
 */
export function JalaliDateField({ id, label, hint, optional, value, onChange, defaultDate, years, addLabel, clearable = true, note, disabled }: Props) {
  const d = parseJalaliKey(value);
  const set = (next: JalaliDate) => {
    const day = Math.min(next.day, jalaliMonthLength(next.year, next.month));
    onChange(formatJalaliKey({ ...next, day }));
  };
  const yearList = d && !years.includes(d.year) ? [...years, d.year].sort((a, b) => a - b) : years;

  const sel = (key: 'day' | 'month' | 'year', aria: string, options: { value: number; label: string }[]) => (
    <OptionPicker
      id={`${id}-${key}`}
      label={aria}
      ariaLabel={`${label} — ${aria}`}
      value={d ? d[key] : 0}
      options={options}
      className={'date-box date-box--' + key}
      onChange={(v) => d && set({ ...d, [key]: v as number })}
      popoverMinWidth={key === 'month' ? 150 : 110}
    />
  );

  const showClear = clearable && d && !disabled;
  return (
    <div className={'field date-field' + (disabled ? ' is-disabled' : '')}>
      <div className="date-field__head">
        <span className="field__label" id={`${id}-label`}>
          {label} {optional && <span className="field__optional">(اختیاری)</span>}
        </span>
        {showClear && (
          <button type="button" className="date-field__clear" aria-label={`حذف ${label}`} onClick={() => onChange(null)}>
            <IconX size={15} />
            <span>حذف</span>
          </button>
        )}
      </div>
      {hint && <p className="field__hint">{hint}</p>}
      {d && !disabled ? (
        <>
          <p className="date-field__one-hint" aria-hidden="true">روز / ماه / سال</p>
          <div className="date-field__row" role="group" aria-labelledby={`${id}-label`}>
            {sel('day', 'روز', Array.from({ length: jalaliMonthLength(d.year, d.month) }, (_, i) => ({ value: i + 1, label: String(i + 1) })))}
            {sel('month', 'ماه', monthOptions)}
            {sel('year', 'سال', yearList.map((y) => ({ value: y, label: String(y) })))}
          </div>
          <p className="date-field__weekday">{jalaliWeekdayFa(d)}{note ? ` · ${note}` : ''}</p>
        </>
      ) : disabled ? (
        <div className="date-field__row is-empty" aria-disabled="true">
          {['روز', 'ماه', 'سال'].map((k) => (
            <div key={k} className="year-picker option-picker date-box is-disabled">
              <span className="year-picker__toggle">
                <span className="year-picker__text"><span className="year-picker__label">{k}</span><span className="year-picker__value">—</span></span>
              </span>
            </div>
          ))}
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
