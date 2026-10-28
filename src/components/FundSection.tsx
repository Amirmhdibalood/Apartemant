import { useCallback, useEffect, useState } from 'react';
import { Switch } from './Switch';
import { buildingRepository, type FundEntryRow } from '../storage/buildingRepository';
import { formatAmount, toPersianDigits } from '../logic/formatting';
import { useFeedback } from '../context/FeedbackContext';
import { Errors } from '../logic/errors';
import { formatJalaliDateTimeFa } from '../logic/date';

const reasonFa = (r: string, kind: string): string => {
  if (r === 'charge_bill') return 'واریز از پرداخت شارژ ساختمان';
  if (r === 'manual' && kind === 'deposit') return 'واریز دستی';
  if (r === 'expense' || kind === 'withdraw') return 'برداشت / هزینه';
  return r;
};

export function FundSection({ reloadKey = 0 }: { reloadKey?: number }) {
  const { toast, showErrors } = useFeedback();
  const [enabled, setEnabled] = useState(false);
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<FundEntryRow[]>([]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const on = await buildingRepository.getFundEnabled();
    setEnabled(on);
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
      <p className="card__hint">
        صندوق برای هر ساختمان جدا و اختیاری است. اگر روشن باشد، با هر پرداخت روی قبض نوع «شارژ ساختمان» همان مبلغ به صندوق واریز می‌شود.
        اگر خاموش باشد، شارژ مثل بقیهٔ قبض‌هاست و بخش صندوق دیده نمی‌شود.
      </p>
      <div className="setting-row">
        <label htmlFor="sw-fund" className="setting-row__text">
          <span className="setting-row__label">صندوق این ساختمان</span>
        </label>
        <Switch id="sw-fund" label="صندوق این ساختمان" checked={enabled} onChange={(v) => void onToggle(v)} />
      </div>

      {enabled && (
        <>
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
                    <div className="fund-ledger__reason">{reasonFa(e.reason, e.kind)}</div>
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
