import { useMemo } from 'react';
import type { SplitMethod } from '../models/types';
import { IconMinus, IconPlus, IconUser } from './Icons';
import { PersonCountInput } from './PersonCountInput';
import { AreaInput } from './AreaInput';
import { useAreaMode } from '../context/AreaModeContext';
import { formatArea, parseArea, sumAreas } from '../logic/area';
import { Checkbox } from './Checkbox';
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
  /** واحد خالی بودن هر واحد (هم‌ردیف personCounts) — فقط برای همین قبض */
  unitVacant?: boolean[];
  /** افزودن واحد (فقط برای همین قبض) */
  onAdd: (persons: string) => void;
  /** حذف آخرین واحد */
  onRemoveLast: () => void;
  /** تغییر نفرات یک واحد */
  onChangeCount: (index: number, value: string) => void;
  /** تغییر وضعیت «خالی» یک واحد (فقط برای همین قبض) */
  onChangeVacant: (index: number, vacant: boolean) => void;
  /** مبلغ قبض (ارقام خام) برای نمایش زنده سهم هر واحد */
  amountDigits?: string;
  splitMethod?: SplitMethod;
  /** متراژ هر ردیف (رشته خام)، هم‌ردیف personCounts */
  unitAreas?: string[];
  /** تغییر متراژ یک واحد (فقط برای همین قبض) */
  onChangeArea?: (index: number, value: string) => void;
}

/** سهم زنده هر واحد (فقط وقتی مبلغ و نفرات معتبر باشند)؛ در غیر این صورت null */
export function liveShares(amountDigits: string, personCounts: string[], method: SplitMethod, vacant?: boolean[], unitAreas?: string[]): number[] | null {
  const digits = onlyDigits(amountDigits ?? '');
  const total = Number(digits);
  if (digits === '' || !Number.isSafeInteger(total) || total <= 0 || personCounts.length === 0) return null;
  const counts: number[] = [];
  if (method === 'perArea') {
    // نفرات در این روش اثری ندارد؛ متراژ همه واحدهای غیرخالی باید معتبر باشد
    if (vacant && personCounts.length > 0 && vacant.slice(0, personCounts.length).filter(Boolean).length >= personCounts.length) return null;
    try {
      return calculateBySplit(total, personCounts.map(() => 0), method, vacant, personCounts.map((_, i) => parseArea(unitAreas?.[i] ?? null))).shares.map((s) => s.shareAmount);
    } catch {
      return null;
    }
  }
  for (const [i, raw] of personCounts.entries()) {
    const t = (raw ?? '').trim();
    if (vacant?.[i]) counts.push(/^\d+$/.test(t) ? Number(t) : 0);
    else if (/^\d+$/.test(t)) counts.push(Number(t));
    else if (method === 'perUnit') counts.push(1);
    else return null;
  }
  if (vacant && personCounts.length > 0 && vacant.slice(0, personCounts.length).filter(Boolean).length >= personCounts.length) return null;
  if (method === 'perPerson' && counts.reduce((s, n, i) => s + (vacant?.[i] ? 0 : n), 0) <= 0) return null;
  try {
    return calculateBySplit(total, counts, method, vacant).shares.map((s) => s.shareAmount);
  } catch {
    return null;
  }
}

/**
 * ۳. بخش واحدها: واحدها از تنظیمات «ساختمان» پر می‌شوند؛ مثل قبل می‌توان واحد افزود/حذف کرد و نفرات را تایپ کرد
 * (فقط برای همین قبض). هر ردیف: نام واحد · نفرات · سهم زنده.
 */
export function UnitsEditor({ personCounts, unitAliases, unitVacant, onAdd, onRemoveLast, onChangeCount, onChangeVacant, amountDigits = '', splitMethod = 'perPerson', unitAreas = [], onChangeArea }: Props) {
  const { areaMode } = useAreaMode();
  const perArea = splitMethod === 'perArea';
  const areaCol = perArea && areaMode === 'column';
  const areaLine = perArea && areaMode === 'line';
  const totalArea = sumAreas(unitAreas, unitVacant);
  const perUnit = splitMethod === 'perUnit';
  const shares = useMemo(() => liveShares(amountDigits, personCounts, splitMethod, unitVacant, unitAreas), [amountDigits, personCounts, splitMethod, unitVacant, unitAreas]);
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
          <span className="units-row__vacant">خالی</span>
          <span className="units-row__count">
            <IconUser size={14} />
            {areaCol ? 'متراژ (م²)' : perUnit ? 'سهم (هر واحد ۱)' : 'تعداد نفرات'}
          </span>
        </div>
        {personCounts.length === 0 && <div className="units-empty">هنوز واحدی اضافه نشده است. با دکمه + واحد اضافه کنید.</div>}
        {personCounts.map((pc, i) => {
          const label = unitLabel(i + 1, unitAliases?.[i]);
          const t = (pc ?? '').trim();
          const vacant = unitVacant?.[i] === true;
          const empty = vacant;
          const share = shares ? shares[i] : null;
          const areaVal = parseArea(unitAreas[i] ?? null);
          const pct = areaVal !== null && totalArea > 0 && !vacant ? Math.round((areaVal / totalArea) * 100) : null;
          return (
            <div className={'units-row' + (vacant ? ' is-empty' : '') + (areaLine ? ' has-line' : '')} key={i}>
              <span className="units-row__unit">
                <span className="unit-avatar"><IconUser size={16} /></span>
                <span className="units-row__text">
                  <span className="units-row__name">{label}</span>
                  <span className="units-row__meta">
                    {!vacant && !perUnit && !perArea && <><span>{/^\d+$/.test(t) ? toPersianDigits(t) : '—'} نفر</span><span className="units-row__dot">·</span></>}
                    {empty ? (
                      <span className="units-row__share is-muted">خالی (بدون سهم)</span>
                    ) : share !== null ? (
                      <span className="units-row__share"><b>{faMoney(share)}</b> {CURRENCY}</span>
                    ) : (
                      <span className="units-row__share is-muted">سهم: —</span>
                    )}
                  </span>
                </span>
              </span>
              <span className="units-row__vacant">
                <Checkbox checked={vacant} onChange={(v) => onChangeVacant(i, v)} ariaLabel={`${label} خالی است`} />
              </span>
              <span className="units-row__count">
                {areaCol ? (
                  <AreaInput
                    value={vacant ? '' : unitAreas[i] ?? ''}
                    disabled={vacant}
                    invalid={!vacant && areaVal === null}
                    ariaLabel={`متراژ واحد ${i + 1}`}
                    onChange={(v) => onChangeArea?.(i, v)}
                  />
                ) : (
                  <PersonCountInput
                    unitNumber={i + 1}
                    value={pc}
                    disabled={perUnit || perArea || vacant}
                    showWeight={perUnit && !vacant}
                    onChange={(v) => onChangeCount(i, v)}
                  />
                )}
              </span>
              {areaLine && !vacant && (
                <span className="units-row__line2">
                  <label htmlFor={`unit-area-${i}`}>متراژ</label>
                  <AreaInput
                    id={`unit-area-${i}`}
                    value={unitAreas[i] ?? ''}
                    invalid={areaVal === null}
                    ariaLabel={`متراژ واحد ${i + 1}`}
                    onChange={(v) => onChangeArea?.(i, v)}
                  />
                  <span className="area-unit">مترمربع</span>
                  {pct !== null && <span className="pct">{toPersianDigits(pct)}٪ از کل متراژ</span>}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="units-hint">
        {perArea
          ? <>سهم هر واحد = متراژ × قیمت هر مترمربع.{totalArea > 0 && <> جمع متراژ: <b className="num">{formatArea(totalArea)}</b> مترمربع.</>}</>
          : perUnit
          ? 'همه واحدهای غیرخالی سهم برابر دارند.'
          : 'واحدی که تیک «خالی» دارد در محاسبه نمی‌آید و سهمی ندارد.'}
        {' '}تغییر «خالی» فقط روی همین قبض اثر دارد.
      </p>
    </section>
  );
}
