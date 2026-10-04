import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BillWithUnits } from '../models/types';
import { CURRENCY, EXPENSE_TYPES, MONTHS } from '../models/constants';
import { AppHeader } from '../components/AppHeader';
import { AmountInput } from '../components/AmountInput';
import { ExpenseIcon } from '../components/ExpenseIcon';
import { UnitName } from '../components/UnitName';
import { IconCheck } from '../components/Icons';
import { useFeedback } from '../context/FeedbackContext';
import { useEntryPrefs, useVisibleBills } from '../context/EntryPrefsContext';
import { billRepository } from '../storage/billRepository';
import { Errors } from '../logic/errors';
import { visibleBills } from '../logic/entryPrefs';
import { latestAliases } from '../logic/building';
import { formatAmount, parseAmount, toPersianDigits } from '../logic/formatting';
import { formatJalaliSlash, todayJalali } from '../logic/jalali';
import { newId } from '../logic/id';
import {
  applyAllocation, previewAllocation, undoBatch, unitTotalDebt,
  type Allocation, type AllocationLine,
} from '../logic/unitPayment';

interface Props {
  unitNumber: number;
  onBack: () => void;
  onOpenHistory: (unitNumber: number) => void;
}

const fa = (n: number) => toPersianDigits(n);
const money = (n: number) => toPersianDigits(formatAmount(n));
const KIND_LABEL = { settled: '✓ تسویه کامل', partial: 'پرداخت جزئی', untouched: 'بدهکار می‌ماند' } as const;

function Lines({ lines, done }: { lines: AllocationLine[]; done: boolean }) {
  return (
    <div className="up-alloc" role="list">
      {lines.map((l) => {
        const pct = l.share > 0 ? Math.round((100 * (l.share - l.remainingAfter)) / l.share) : 0;
        return (
          <div key={l.billId} className="up-line" role="listitem" data-kind={l.kind}>
            <ExpenseIcon type={l.expenseType} size={36} />
            <span className="up-line__main">
              <span className="up-line__title">
                {EXPENSE_TYPES[l.expenseType].label} <span className="up-line__period">· {MONTHS[l.month - 1]} <span className="num">{l.year}</span></span>
              </span>
              <span className="up-bar" aria-hidden="true"><i className={'up-bar__fill is-' + l.kind} style={{ width: `${pct}%` }} /></span>
              <span className="up-line__sub">
                {l.kind === 'untouched'
                  ? <>بدون تغییر · مانده <span className="num">{formatAmount(l.remainingBefore)}</span></>
                  : <>{done ? 'پرداخت شد' : 'پرداخت می‌شود'}: <span className="num">{formatAmount(l.pay)}</span> از <span className="num">{formatAmount(l.remainingBefore)}</span></>}
              </span>
            </span>
            <span className="up-line__side">
              <span className={'up-tag is-' + l.kind}>{KIND_LABEL[l.kind]}</span>
              <b>مانده <span className="num">{formatAmount(l.remainingAfter)}</span></b>
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface Done { allocation: Allocation; batchId: string; paidAtLabel: string }

/** صفحهٔ «پرداخت بدهی واحد»: تسویه کامل یا مبلغ دلخواه با پیش‌نمایش زندهٔ تخصیص از قدیمی‌ترین قبض + نتیجه + لغو */
export function UnitPaymentScreen({ unitNumber, onBack, onOpenHistory }: Props) {
  const { toast, showErrors, confirmDanger } = useFeedback();
  const [allRaw, setAll] = useState<BillWithUnits[] | null>(null);
  const all = useVisibleBills(allRaw);
  const { prefs } = useEntryPrefs();
  const [mode, setMode] = useState<'full' | 'amount'>('full');
  const [digits, setDigits] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => { setAll(await billRepository.getAll()); }, []);
  useEffect(() => { void reload(); }, [reload]);

  const alias = useMemo(() => (all ? latestAliases(all).get(unitNumber) ?? null : null), [all, unitNumber]);
  const totalDebt = useMemo(() => (all ? unitTotalDebt(all, unitNumber) : 0), [all, unitNumber]);
  const typed = parseAmount(digits);
  const preview = useMemo(
    () => (all ? previewAllocation(all, unitNumber, mode, typed) : { error: null, allocation: null }),
    [all, unitNumber, mode, typed],
  );
  const oldestDays = useMemo(() => {
    if (!all) return 0;
    const first = preview.allocation?.lines[0] ?? null;
    if (!first) return 0;
    return Math.max(0, Math.floor((Date.now() - Date.parse(first.createdAt)) / 86400000));
  }, [all, preview.allocation]);

  const title = 'پرداخت بدهی واحد';
  const a = preview.allocation;
  const today = formatJalaliSlash(todayJalali());
  // خطا فقط وقتی کاربر چیزی تایپ کرده یا مبلغ بیش از سقف است
  const showError = mode === 'amount' && preview.error && (digits !== '' || totalDebt <= 0);

  const submit = async () => {
    if (!all || !a || busy) return;
    if (a.locksCount > 0) {
      const ok = await confirmDanger({
        title: 'قفل شدن قبض‌ها',
        text: `با این پرداخت ${fa(a.locksCount)} قبض کاملاً تسویه و قفل می‌شود (دیگر قابل ویرایش نیست). ادامه می‌دهید؟`,
        confirmLabel: 'ثبت پرداخت', tone: 'warning',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const fresh = visibleBills(await billRepository.getAll(), prefs); // آخرین وضعیت ذخیره‌شده (همان قبض‌های دیده‌شده در گزارش)
      const again = previewAllocation(fresh, unitNumber, a.mode, a.mode === 'amount' ? a.amount : null);
      if (!again.allocation) { showErrors(Errors.storageFailed()); return; }
      const batchId = newId();
      await billRepository.upsertMany(applyAllocation(fresh, again.allocation, batchId));
      setDone({ allocation: again.allocation, batchId, paidAtLabel: today });
      toast('پرداخت ثبت شد.');
      await reload();
    } catch {
      showErrors(Errors.storageFailed());
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!done) return;
    const ok = await confirmDanger({
      title: 'لغو این پرداخت', text: `پرداخت ${money(done.allocation.amount)} ${CURRENCY} برگردانده می‌شود و بدهی قبض‌ها به حالت قبل برمی‌گردد.`,
      confirmLabel: 'لغو پرداخت',
    });
    if (!ok) return;
    try {
      const raw = await billRepository.getAllWithDeleted();
      await billRepository.upsertMany(undoBatch(raw, done.batchId));
      setDone(null); setDigits(''); setMode('full');
      toast('پرداخت لغو شد.');
      await reload();
    } catch {
      showErrors(Errors.storageFailed());
    }
  };

  // ───── نتیجه
  if (done) {
    const d = done.allocation;
    const remain = all ? unitTotalDebt(all, unitNumber) : d.remainingDebt;
    return (
      <>
        <AppHeader title="پرداخت ثبت شد" onBack={onBack} />
        <main className="screen screen--report up-screen">
          <div className="up-ok">
            <span className="up-ok__icon"><IconCheck size={34} /></span>
            <h2>پرداخت <span className="num">{formatAmount(d.amount)}</span> {CURRENCY} ثبت شد</h2>
            <p><UnitName n={unitNumber} alias={alias} /> · <span className="num">{done.paidAtLabel}</span></p>
          </div>
          <div className="up-sum">
            <div><span>بدهی قبلی</span><b className="num">{formatAmount(d.totalDebt)}</b></div>
            <div className="is-ok"><span>پرداخت‌شده</span><b className="num">{formatAmount(d.amount)}</b></div>
            <div className={remain > 0 ? 'is-due' : 'is-ok'}><span>مانده بدهی</span><b className="num">{formatAmount(remain)}</b></div>
          </div>
          <div className="up-h">
            <span>نتیجه به تفکیک قبض</span>
            <small><span className="num">{d.settledCount}</span> تسویه · <span className="num">{d.partialCount}</span> جزئی · <span className="num">{d.untouchedCount}</span> دست‌نخورده</small>
          </div>
          <div className="up-card"><Lines lines={d.lines} done /></div>
          <p className="up-note">تاریخ این پرداخت‌ها در «سابقه پرداخت» ثبت شد.{d.locksCount > 0 && <> <span className="num">{d.locksCount}</span> قبض با این پرداخت کاملاً تسویه و قفل شد.</>}</p>
          <div className="up-actions">
            <button type="button" className="btn btn--soft btn--block" onClick={() => onOpenHistory(unitNumber)}>سابقه پرداخت</button>
            <button type="button" className="btn btn--primary btn--block" onClick={onBack}>بازگشت به بدهکاران</button>
            <button type="button" className="up-undo" onClick={() => void undo()}>لغو این پرداخت (برگرداندن <span className="num">{formatAmount(d.amount)}</span> {CURRENCY})</button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader title={title} onBack={onBack} />
      <main className="screen screen--report up-screen">
        {!all && null}
        {all && totalDebt <= 0 && (
          <div className="empty-state"><IconCheck size={40} /><p>این واحد بدهی ندارد؛ همه قبض‌ها تسویه شده‌اند.</p></div>
        )}
        {all && totalDebt > 0 && (
          <>
            <div className="up-card up-head">
              <span className="up-head__main">
                <span className="up-head__title"><UnitName n={unitNumber} alias={alias} /></span>
                <span className="up-head__sub">
                  <span className="num">{a?.lines.length ?? 0}</span> قبض تسویه‌نشده
                  {oldestDays > 7 && <> · قدیمی‌ترین: <span className="num">{oldestDays}</span> روز</>}
                </span>
              </span>
              <span className="up-head__debt"><small>جمع بدهی</small><b className="num">{formatAmount(totalDebt)}</b> {CURRENCY}</span>
            </div>

            <div className="up-h"><span>روش پرداخت</span></div>
            <div className="up-opts" role="radiogroup" aria-label="روش پرداخت">
              <button type="button" role="radio" aria-checked={mode === 'full'} className={'up-opt' + (mode === 'full' ? ' is-sel' : '')} onClick={() => setMode('full')}>
                <span className="up-radio" aria-hidden="true" />
                <span className="up-opt__main"><b>تسویه کامل</b><small>همهٔ بدهی واحد · <span className="num">{formatAmount(totalDebt)}</span> {CURRENCY}</small></span>
              </button>
              <button type="button" role="radio" aria-checked={mode === 'amount'} className={'up-opt' + (mode === 'amount' ? ' is-sel' : '')} onClick={() => setMode('amount')}>
                <span className="up-radio" aria-hidden="true" />
                <span className="up-opt__main"><b>پرداخت مبلغ دلخواه</b><small>از قدیمی‌ترین قبض کم می‌شود</small></span>
              </button>
            </div>

            {mode === 'amount' && (
              <div className="up-amount">
                <label className="field__label" htmlFor="up-amount">مبلغ پرداخت</label>
                <AmountInput id="up-amount" digits={digits} onChange={setDigits} placeholder={formatAmount(totalDebt)} suffix={CURRENCY} />
                {showError ? <p className="pay-error" role="alert">{preview.error}</p> : null}
                <div className="up-chips">
                  <button type="button" className="up-chip" onClick={() => setDigits(String(totalDebt))}>همهٔ بدهی <span className="num">{formatAmount(totalDebt)}</span></button>
                  {totalDebt >= 2 && <button type="button" className="up-chip" onClick={() => setDigits(String(Math.floor(totalDebt / 2)))}>نیمی <span className="num">{formatAmount(Math.floor(totalDebt / 2))}</span></button>}
                </div>
              </div>
            )}

            <div className="up-h"><span>پیش‌نمایش تخصیص</span><small>از قدیمی‌ترین قبض ← جدیدتر</small></div>
            {a ? (
              <div className="up-card"><Lines lines={a.lines} done={false} /></div>
            ) : (
              <div className="up-card up-empty">مبلغ پرداخت را وارد کنید تا تخصیص آن به قبض‌ها نشان داده شود.</div>
            )}
            {a && (
              <div className="up-sum">
                <div><span>پرداخت</span><b className="num">{formatAmount(a.amount)}</b></div>
                <div className={a.remainingDebt > 0 ? 'is-due' : 'is-ok'}><span>مانده بدهی پس از پرداخت</span><b className="num">{formatAmount(a.remainingDebt)}</b></div>
                <div><span>تاریخ پرداخت</span><b>امروز <span className="num">{today}</span></b></div>
              </div>
            )}
            <p className="up-note">
              سقف مبلغ، کل بدهی واحد است. هر بخشی که پرداخت نشود همچنان در «بدهکاران» می‌ماند.
              {a && a.locksCount > 0 && <> با این پرداخت <b className="num">{a.locksCount}</b> قبض کاملاً تسویه و قفل می‌شود.</>}
            </p>
            <div className="up-stick">
              <button type="button" className="btn btn--primary btn--block" disabled={!a || busy} onClick={() => void submit()}>
                {a ? <>ثبت پرداخت <span className="num">{formatAmount(a.amount)}</span> {CURRENCY}</> : 'ثبت پرداخت'}
              </button>
            </div>
          </>
        )}
      </main>
    </>
  );
}

