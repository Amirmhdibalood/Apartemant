import { useMemo } from 'react';
import type { SplitMethod } from '../models/types';
import { IconMinus, IconPlus, IconUser } from './Icons';
import { PersonCountInput } from './PersonCountInput';
import { DEFAULT_PERSON_COUNT } from '../logic/billFactory';
import { unitLabel } from '../logic/building';
import { calculateBySplit } from '../logic/split';
import { formatAmount, onlyDigits, toPersianDigits } from '../logic/formatting';

const faMoney = (n: number) => toPersianDigits(formatAmount(n)).replace(/,/g, '٬');
import { CURRENCY } from '../models/constants';

interface Props {
  personCounts: string[];
  /** اسم مستعار هر واحد (هم‌ردیف personCounts) */
  unitAliases?: (string | null)[];
  /** افزودن واحد (فقط برای همین قبض) */
  onAdd: (persons: string) => void;
  /** حذف آخرین واحد */
  onRemoveLast: () => void;
  /** تغییر نفرات یک واحد */
  onChangeCount: (index: number, value: string) => void;
  /** مبلغ قبض (ارقام خام) برای نمایش زنده سهم هر واحد */
  amountDigits?: string;
  splitMethod?: SplitMethod;
}

/** سهم زنده هر واحد (فقط وقتی مبلغ و نفرات معتبر باشند)؛ در غیر این صورت null */
export function liveShares(amountDigits: string, personCounts: string[], method: SplitMethod): number[] | null {
  const digits = onlyDigits(amountDigits ?? '');
  const total = Number(digits);
  if (digits === '' || !Number.isSafeInteger(total) || total <= 0 || personCounts.length === 0) return null;
  const counts: number[] = [];
  for (const raw of personCounts) {
    const t = (raw ?? '').trim();
    if (/^\d+$/.test(t)) counts.push(Number(t));
    else if (method === 'perUnit') counts.push(1);
    else return null;
  }
  if (method === 'perPerson' && counts.reduce((s, n) => s + n, 0) <= 0) return null;
  try {
    return calculateBySplit(total, counts, method).shares.map((s) => s.shareAmount);
  } catch {
    return null;
  }
}

/**
 * ۳. بخش واحدها: واحدها از تنظیمات «ساختمان» پر می‌شوند؛ مثل قبل می‌توان واحد افزود/حذف کرد و نفرات را تایپ کرد
 * (فقط برای همین قبض). هر ردیف: نام واحد · نفرات · سهم زنده.
 */
export function UnitsEditor({ personCounts, unitAliases, onAdd, onRemoveLast, onChangeCount, amountDigits = '', splitMethod = 'perPerson' }: Props) {
  const perUnit = splitMethod === 'perUnit';
  const shares = useMemo(() => liveShares(amountDigits, personCounts, splitMethod), [amountDigits, personCounts, splitMethod]);
  return (
    <section className="units">
      <div className="section-head">
        <h2 className="section-title">واحدها <span className="section-title__count num">({personCounts.length})</span></h2>
        <div className="section-head__actions">
          <button
            type="button"
            className="square-btn square-btn--red"
            aria-label="حذف آخرین واحد"
            onClick={onRemoveLast}
            disabled={personCounts.length === 0}
          >
            <IconMinus size={18} strokeWidth={3} />
          </button>
          <button
            type="button"
            className="square-btn square-btn--green"
            aria-label="افزودن واحد"
            onClick={() => onAdd(DEFAULT_PERSON_COUNT)}
          >
            <IconPlus size={18} strokeWidth={3} />
          </button>
        </div>
      </div>

      <div className="table-card">
        <div className="units-row units-row--head">
          <span className="units-row__unit">واحد</span>
          <span className="units-row__count">
            <IconUser size={14} />
            {perUnit ? 'سهم (هر واحد ۱)' : 'تعداد نفرات'}
          </span>
        </div>
        {personCounts.length === 0 && <div className="units-empty">هنوز واحدی اضافه نشده است. با دکمه + واحد اضافه کنید.</div>}
        {personCounts.map((pc, i) => {
          const label = unitLabel(i + 1, unitAliases?.[i]);
          const t = (pc ?? '').trim();
          const empty = t === '0';
          const share = shares ? shares[i] : null;
          return (
            <div className={'units-row' + (empty && !perUnit ? ' is-empty' : '')} key={i}>
              <span className="units-row__unit">
                <span className="unit-avatar"><IconUser size={16} /></span>
                <span className="units-row__text">
                  <span className="units-row__name">{label}</span>
                  <span className="units-row__meta">
                    <span>{/^\d+$/.test(t) ? toPersianDigits(t) : '—'} نفر</span>
                    <span className="units-row__dot">·</span>
                    {empty && !perUnit ? (
                      <span className="units-row__share is-muted">واحد خالی (بدون سهم)</span>
                    ) : share !== null ? (
                      <span className="units-row__share"><b>{faMoney(share)}</b> {CURRENCY}</span>
                    ) : (
                      <span className="units-row__share is-muted">سهم: —</span>
                    )}
                  </span>
                </span>
              </span>
              <span className="units-row__count">
                <PersonCountInput
                  unitNumber={i + 1}
                  value={pc}
                  disabled={perUnit}
                  onChange={(v) => onChangeCount(i, v)}
                />
              </span>
            </div>
          );
        })}
      </div>
      <p className="units-hint">
        {perUnit
          ? 'همه واحدها (حتی واحد خالی) سهم برابر دارند.'
          : 'برای واحد خالی تعداد نفرات را ۰ وارد کنید؛ سهم آن صفر می‌شود.'}
      </p>
    </section>
  );
}
