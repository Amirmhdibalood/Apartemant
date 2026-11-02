import { IconCheck } from './Icons';
import { toPersianDigits } from '../logic/formatting';
import { FUND_HINT_FUTURE_ONLY, fundHint } from '../logic/fundTypes';

export interface FundTypeOption {
  id: string;
  label: string;
  /** رنگ نوع (نقطهٔ کنار نام)، مطابق تم فعلی */
  color: string;
  /** برچسب کوچک کنار ردیف (مثلاً «پیش‌فرض») */
  tag?: string;
}

interface Props {
  options: FundTypeOption[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
  /** ترتیب و نام همهٔ نوع‌ها برای متن راهنما (پیش‌فرض: نوع‌های داخلی) */
  hintOrder?: readonly string[];
  hintLabel?: (id: string) => string;
}

const InfoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
  </svg>
);
const WarnIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 2 21h20z" /><path d="M12 10v4M12 17h.01" />
  </svg>
);

/** «قبض‌های واریزی به صندوق»: فهرست تیک‌دار + راهنمای پویا (موکاپ ۰۹). عمومی روی فهرست نوع‌ها. */
export function FundTypesPicker({ options, selected, onToggle, disabled, hintOrder, hintLabel }: Props) {
  const count = options.filter((o) => selected.includes(o.id)).length;
  const h = fundHint(selected, hintOrder, hintLabel);
  return (
    <>
      <div className="fund-types" role="group" aria-labelledby="fund-types-title">
        <div className="fund-types__head">
          <span className="fund-types__title" id="fund-types-title">قبض‌های واریزی به صندوق</span>
          <span className="fund-types__count">{toPersianDigits(count)} از {toPersianDigits(options.length)}</span>
        </div>
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <label key={o.id} className={'year-row' + (on ? ' is-active' : '')}>
              <input type="checkbox" checked={on} disabled={disabled} onChange={() => onToggle(o.id)} aria-label={o.label} />
              <span className="year-row__box" aria-hidden="true">{on && <IconCheck size={15} strokeWidth={3} />}</span>
              <span className="fund-types__dot" style={{ background: o.color }} aria-hidden="true" />
              <span className="year-row__year">{o.label}</span>
              {o.tag ? <span className="fund-types__tag">{o.tag}</span> : null}
            </label>
          );
        })}
      </div>
      <p className={'fund-note' + (h.kind === 'none' ? ' is-empty' : '')} role="status">
        {h.kind === 'none' ? <WarnIcon /> : <InfoIcon />}
        <span>
          {h.kind === 'none' && <>هیچ قبضی انتخاب نشده؛ <b>پرداخت قبض‌ها به صندوق نمی‌رود</b>. فقط واریز و برداشت دستی در صندوق ثبت می‌شود.</>}
          {h.kind === 'all' && <>با هر پرداخت روی <b>همهٔ قبض‌ها</b>، همان مبلغ به صندوق واریز می‌شود.</>}
          {h.kind === 'some' && <>با هر پرداخت روی {h.single ? 'قبض' : 'قبض‌های'} <b>{h.names}</b>، همان مبلغ به صندوق واریز می‌شود. بقیهٔ قبض‌ها به صندوق نمی‌روند.</>}
          <span className="fund-note__sub">{FUND_HINT_FUTURE_ONLY}</span>
        </span>
      </p>
    </>
  );
}
