import { useCallback, useEffect, useState } from 'react';
import { Switch } from './Switch';
import { buildingRepository, type FundEntryRow } from '../storage/buildingRepository';
import { formatAmount, toPersianDigits } from '../logic/formatting';
import { useFeedback } from '../context/FeedbackContext';
import { Errors } from '../logic/errors';
import { formatJalaliDateTimeFa } from '../logic/date';
import { DEFAULT_FUND_TYPES, fundDisplayOrder, fundReasonFa, fundTypeRows, toggleFundType } from '../logic/fundTypes';
import type { ExpenseType } from '../models/types';
import { typeColors } from '../logic/typeColor';
import { useTheme } from '../context/ThemeContext';
import { useEntryPrefs } from '../context/EntryPrefsContext';
import { FundTypesPicker, type FundTypeOption } from './FundTypesPicker';
import { typeInfo } from '../logic/billTypes';

export function FundSection({ reloadKey = 0 }: { reloadKey?: number }) {
  const { toast, showErrors } = useFeedback();
  const [enabled, setEnabled] = useState(false);
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<FundEntryRow[]>([]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fundTypes, setFundTypes] = useState<ExpenseType[]>([...DEFAULT_FUND_TYPES]);
  const { theme, palette, lightPalette } = useTheme();
  const { prefs, customTypes } = useEntryPrefs();
  // نوع‌های سفارشی همین ساختمان بلافاصله در فهرست انتخاب هستند (بعد از نوع‌های داخلی)
  const order = fundDisplayOrder(customTypes.map((c) => c.id));

  const reload = useCallback(async () => {
    const on = await buildingRepository.getFundEnabled();
    setEnabled(on);
    setFundTypes(await buildingRepository.getFundTypes());
    if (!on) { setBalance(0); setEntries([]); return; }
    setBalance(await buildingRepository.getFundBalance());
    setEntries(await buildingRepository.listFundEntries());
  }, []);

  useEffect(() => { void reload().catch(() => undefined); }, [reload, reloadKey]);
  useEffect(() => buildingRepository.onActiveChange(() => { void reload(); }), [reload]);

  const onToggle = async (v: boolean) => {
    try {
      await buildingRepository.setFundEnabled(v);
      setEnabled(v);
      toast(v ? 'صندوق این ساختمان روشن شد.' : 'صندوق این ساختمان خاموش شد.');
      await reload();
    } catch {
      showErrors(Errors.storageFailed());
    }
  };

  const onToggleType = async (id: string) => {
    const prev = fundTypes;
    const next = toggleFundType(prev, id as ExpenseType, order);
    setFundTypes(next);
    try {
      await buildingRepository.setFundTypes(next);
    } catch {
      setFundTypes(prev);
      showErrors(Errors.storageFailed());
    }
  };

  const typeOptions: FundTypeOption[] = fundTypeRows(prefs.types, fundTypes, order).map((t) => ({
    id: t,
    label: typeInfo(t).label,
    color: typeColors(t, theme, palette, lightPalette).color,
    tag: DEFAULT_FUND_TYPES.includes(t) ? 'پیش‌فرض' : undefined,
  }));

  const parseAmt = (): number | null => {
    const digits = amount.replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  };

  const doWithdraw = async () => {
    const n = parseAmt();
    if (n == null) { showErrors(Errors.backupInvalid('مبلغ برداشت را درست وارد کنید.')); return; }
    setBusy(true);
    try {
      await buildingRepository.addFundWithdraw(n, note.trim() || null);
      setAmount(''); setNote('');
      toast('برداشت از صندوق ثبت شد.');
      await reload();
    } catch (e) {
      const msg = e instanceof Error && e.message === 'insufficient fund balance'
        ? 'مبلغ از موجودی صندوق بیشتر است.'
        : 'ثبت برداشت ممکن نشد.';
      showErrors(Errors.backupInvalid(msg));
    } finally { setBusy(false); }
  };

  const doDeposit = async () => {
    const n = parseAmt();
    if (n == null) { showErrors(Errors.backupInvalid('مبلغ واریز را درست وارد کنید.')); return; }
    setBusy(true);
    try {
      await buildingRepository.addFundDepositManual(n, note.trim() || null);
      setAmount(''); setNote('');
      toast('واریز دستی ثبت شد.');
      await reload();
    } catch {
      showErrors(Errors.storageFailed());
    } finally { setBusy(false); }
  };

  return (
    <div className="fund-card">
      <p className="card__hint fund-card__intro">صندوق برای هر ساختمان جدا و اختیاری است.</p>
      <div className="setting-row">
        <label htmlFor="sw-fund" className="setting-row__text">
          <span className="setting-row__label">صندوق این ساختمان</span>
        </label>
        <Switch id="sw-fund" label="صندوق این ساختمان" checked={enabled} onChange={(v) => void onToggle(v)} />
      </div>

      {enabled && (
        <>
          <FundTypesPicker options={typeOptions} selected={fundTypes} onToggle={(id) => void onToggleType(id)} hintOrder={order} />

          <div className="fund-balance" role="status">
            <span className="fund-balance__label">موجودی</span>
            <strong className="fund-balance__value">{formatAmount(balance)} تومان</strong>
          </div>

          <div className="fund-form">
            <label className="field">
              <span className="field__label">مبلغ (تومان)</span>
              <input className="input" inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} placeholder="0" />
            </label>
            <label className="field">
              <span className="field__label">توضیح (اختیاری)</span>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value.slice(0, 120))} placeholder="مثلاً تعمیر آسانسور" />
            </label>
            <div className="fund-form__actions">
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void doWithdraw()}>برداشت از صندوق</button>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void doDeposit()}>واریز دستی</button>
            </div>
          </div>

          <h3 className="settings-sub">گردش صندوق</h3>
          {entries.length === 0 ? (
            <p className="card__hint">هنوز گردشی ثبت نشده است.</p>
          ) : (
            <ul className="fund-ledger">
              {[...entries].reverse().map((e) => (
                <li key={e.id} className={'fund-ledger__row' + (e.kind === 'withdraw' ? ' is-out' : ' is-in')}>
                  <div>
                    <div className="fund-ledger__reason">{fundReasonFa(e.reason, e.kind, e.billExpenseType)}</div>
                    {e.note ? <div className="fund-ledger__note">{e.note}</div> : null}
                    <div className="fund-ledger__date">{formatJalaliDateTimeFa(new Date(e.createdAt))}</div>
                  </div>
                  <strong dir="ltr">{e.kind === 'withdraw' ? '−' : '+'}{toPersianDigits(formatAmount(e.amount))}</strong>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
