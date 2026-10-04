import { VACANT_LABEL } from '../logic/vacant';
import { useEffect, useState } from 'react';
import { unitLabel } from '../logic/building';
import type { Bill, BillDraft, BillWithUnits, Unit } from '../models/types';
import { CURRENCY, EXPENSE_TYPES, SPLIT_METHOD_LABELS, monthName } from '../models/constants';
import { splitMethodOf } from '../logic/split';
import { AppHeader } from '../components/AppHeader';
import { ExpenseIcon } from '../components/ExpenseIcon';
import { PaymentDialog } from '../components/PaymentDialog';
import { BillImageActions } from '../components/BillImageActions';
import { Checkbox } from '../components/Checkbox';
import { Dialog } from '../components/Dialog';
import { JalaliDateField } from '../components/JalaliDateField';
import { IconCalendar, IconCheck, IconEdit, IconLock, IconRestore, IconTrash } from '../components/Icons';
import { useFeedback } from '../context/FeedbackContext';
import { billRepository } from '../storage/billRepository';
import { formatAmount, toPersianDigits } from '../logic/formatting';
import { useAreaMode } from '../context/AreaModeContext';
import { formatArea, sumAreas } from '../logic/area';
import { allSettled } from '../logic/settlement';
import { addPayment, clearPayments, completesBill, paidAmount, remainingAmount, settleFully } from '../logic/payments';
import { draftFromBill } from '../logic/billFactory';
import { Errors } from '../logic/errors';
import {
  BillDeleteBlockedError, BillPaidMessages, canDeleteBill, isBillDeleted, isBillPaid, setBillDueDate, setBillPaid, setBillPaidDate,
} from '../logic/billPaid';
import { DEFAULT_DUE_OFFSET_DAYS, billTone, dueText } from '../logic/billStatus';
import { addJalaliDays, dateYearOptions, formatJalaliSlash, parseJalaliKey, todayJalali } from '../logic/jalali';
import { formatJalaliDateTimeFa } from '../logic/date';
import { classifyBillPayment } from '../logic/billPaymentReport';

interface Props {
  billId: string;
  onBack: () => void;
  onEdit: (draft: BillDraft) => void;
}

/** ۹، ۱۰ و ۱۱. جزئیات قبض + تسویه + قفل ویرایش + «پرداخت شد» / مهلت پرداخت / حذف نرم (۱.۵.۰) */
export function BillDetailsScreen({ billId, onBack, onEdit }: Props) {
  const { showLocked, confirmWarning, confirmDanger, showErrors, toast } = useFeedback();
  const [data, setData] = useState<BillWithUnits | null | undefined>(undefined);
  const [payUnit, setPayUnit] = useState<Unit | null>(null);
  const [dueEdit, setDueEdit] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    billRepository.getById(billId).then(setData);
  }, [billId]);

  if (data === undefined) return <><AppHeader title="جزئیات قبض" onBack={onBack} /><main className="screen" /></>;
  if (data === null) {
    return (
      <>
        <AppHeader title="جزئیات قبض" onBack={onBack} />
        <main className="screen"><div className="empty-state"><p>{Errors.billNotFound().message}</p></div></main>
      </>
    );
  }

  const { bill, units } = data;
  const { areaMode } = useAreaMode();
  const perArea = splitMethodOf(bill) === 'perArea';
  const areaCol = perArea && areaMode === 'column';
  const areaLine = perArea && areaMode === 'line';
  const totalArea = perArea ? sumAreas(units.map((u) => u.area), units.map((u) => u.vacant === true)) : 0;
  const ppmExact = totalArea > 0 ? bill.totalAmount / totalArea : 0;
  const faMoney = (n: number) => toPersianDigits(formatAmount(n)).replace(/,/g, '٬');
  const ppmText = (Number.isInteger(ppmExact) ? '' : '≈ ') + faMoney(Math.round(ppmExact));
  const type = EXPENSE_TYPES[bill.expenseType];
  const locked = bill.isFullySettled;
  const deleted = isBillDeleted(bill);
  const billPaid = isBillPaid(bill);
  const deletable = canDeleteBill(bill);
  const today = todayJalali();
  const tone = billTone(bill, today);
  const due = parseJalaliKey(bill.dueDate);
  const paidDate = parseJalaliKey(bill.billPaidDate);
  const years = dateYearOptions(bill.year, today.year, today.year + 1);

  /** ذخیره تغییرات خودِ قبض (پرداخت شد، مهلت، ...) */
  const saveBill = async (nextBill: Bill, message?: string) => {
    try {
      await billRepository.upsert(nextBill, units);
      setData({ bill: nextBill, units });
      if (message) toast(message);
      return true;
    } catch {
      showErrors(Errors.storageFailed());
      return false;
    }
  };

  const openPayment = (u: Unit) => {
    if (deleted) { toast(BillPaidMessages.deletedReadOnly); return; }
    if (locked) { showLocked(); return; }
    setPayUnit(u);
  };

  /** ذخیره واحد به‌روزشده (پرداخت کامل/جزئی یا حذف پرداخت‌ها). تاریخ پرداخت خودکار ثبت می‌شود و فقط در «گزارش‌ها» نمایش داده می‌شود. */
  const saveUnit = async (updated: Unit, message: string) => {
    if (completesBill(units, updated)) {
      setPayUnit(null);
      if (!(await confirmWarning('lastUnitSettle'))) return;
    }
    const nextUnits = units.map((u) => (u.id === updated.id ? updated : u));
    const nextBill = { ...bill, isFullySettled: allSettled(nextUnits) };
    try {
      await billRepository.upsert(nextBill, nextUnits);
      setData({ bill: nextBill, units: nextUnits });
      setPayUnit(null);
      toast(message);
    } catch {
      showErrors(Errors.storageFailed());
    }
  };

  const edit = () => {
    if (locked) { showLocked(); return; }
    onEdit(draftFromBill(data));
  };

  /** «پرداخت شد»: مدیر ساختمان خودِ قبض را پرداخت کرده است (تاریخ پیش‌فرض امروز، قابل ویرایش) */
  const toggleBillPaid = (paid: boolean) =>
    void saveBill(setBillPaid(bill, paid, today), paid ? BillPaidMessages.markedPaid : BillPaidMessages.markedUnpaid);

  const saveDue = async () => {
    const value = dueEdit ?? null;
    setDueEdit(undefined);
    await saveBill(setBillDueDate(bill, value), value ? 'مهلت پرداخت ذخیره شد.' : 'مهلت پرداخت حذف شد.');
  };

  const remove = async () => {
    if (!deletable) { toast(BillPaidMessages.deleteBlocked); return; }
    const ok = await confirmDanger({
      title: 'حذف قبض',
      text: 'قبض به دسته «حذف‌شده» منتقل می‌شود و دیگر در سوابق، گزارش‌ها و بدهکاران دیده نمی‌شود. از فیلتر وضعیت «حذف‌شده» در سوابق می‌توانید آن را بازگردانی کنید.',
      confirmLabel: 'حذف',
    });
    if (!ok) return;
    try {
      await billRepository.remove(bill.id);
    } catch (e) {
      if (e instanceof BillDeleteBlockedError) { toast(e.message); return; }
      showErrors(Errors.storageFailed());
      return;
    }
    toast(BillPaidMessages.deleted);
    onBack();
  };

  const restore = async () => {
    try {
      await billRepository.restore(bill.id);
      setData(await billRepository.getById(bill.id));
      toast(BillPaidMessages.restored);
    } catch {
      showErrors(Errors.storageFailed());
    }
  };

  const purge = async () => {
    const ok = await confirmDanger({
      title: 'حذف دائمی',
      text: 'این قبض و همه واحدها و پرداخت‌های آن برای همیشه پاک می‌شود. این عمل قابل بازگشت نیست.',
      confirmLabel: 'حذف دائمی',
    });
    if (!ok) return;
    try {
      await billRepository.purge(bill.id);
    } catch (e) {
      if (e instanceof BillDeleteBlockedError) { toast(e.message); return; }
      showErrors(Errors.storageFailed());
      return;
    }
    toast(BillPaidMessages.purged);
    onBack();
  };

  const dueInfo = dueText(bill, today);
  const timing = classifyBillPayment(bill, today);

  return (
    <>
      <AppHeader title="جزئیات قبض" onBack={onBack} />
      <main className="screen screen--details">
        {deleted && (
          <section className="deleted-banner" role="status">
            <IconTrash size={20} />
            <div>
              <b>این قبض حذف شده است</b>
              <p>
                {bill.deletedAt && <>حذف در <span className="num">{formatJalaliDateTimeFa(new Date(bill.deletedAt))}</span>. </>}
                قبض حذف‌شده در سوابق، گزارش‌ها و بدهکاران حساب نمی‌شود.
              </p>
            </div>
          </section>
        )}

        <section className={`summary-card tone-${tone}`}>
          <div className="summary-card__body">
            <h2 className="summary-card__title">{type.label}</h2>
            <div className="kv kv--pair">
              <span><span className="kv__k">سال:</span><span className="num">{bill.year}</span></span>
              <span><span className="kv__k">ماه:</span>{monthName(bill.month)}</span>
            </div>
            {bill.billNumber && (
              <div className="kv"><span className="kv__k">شماره قبض:</span><b className="num">{bill.billNumber}</b></div>
            )}
            <div className="kv"><span className="kv__k">مبلغ کل قبض:</span><b className="num">{formatAmount(bill.totalAmount)}</b> {CURRENCY}</div>
            <div className="kv"><span className="kv__k">نحوه تقسیم:</span><span className={'split-badge is-' + splitMethodOf(bill)}>{SPLIT_METHOD_LABELS[splitMethodOf(bill)]}</span></div>
            {perArea && totalArea > 0 && (
              <div className="kv"><span className="kv__k">مجموع متراژ:</span><b className="num">{formatArea(totalArea)}</b> مترمربع</div>
            )}
            {areaCol && totalArea > 0 && (
              <div className="kv"><span className="kv__k">قیمت هر مترمربع:</span><b className="num">{ppmText}</b> {CURRENCY}</div>
            )}
            <div className="kv kv--due">
              <span className="kv__k">مهلت پرداخت:</span>
              {due ? <b className="num">{formatJalaliSlash(due)}</b> : <span className="kv__none">تعیین نشده</span>}
              {due && !billPaid && !deleted && dueInfo && <span className={'due-chip' + (tone === 'due' ? ' is-due' : '')}>{dueInfo}</span>}
              {!deleted && (
                <button type="button" className="link-btn" onClick={() => setDueEdit(bill.dueDate ?? null)}>
                  {due ? 'تغییر' : 'تعیین'}
                </button>
              )}
            </div>
            {bill.description && (
              <div className="kv kv--desc"><span className="kv__k">توضیحات:</span><span>{bill.description}</span></div>
            )}
          </div>
          <ExpenseIcon type={bill.expenseType} size={50} />
        </section>

        {!deleted && (
          <section className={'bill-paid-card' + (billPaid ? ' is-paid' : '')} aria-label="پرداخت قبض">
            <Checkbox
              className="bill-paid-card__check"
              checked={billPaid}
              onChange={toggleBillPaid}
              label="پرداخت شد"
              ariaLabel="قبض پرداخت شد"
            />
            {billPaid ? (
              <>
                <JalaliDateField
                  id="paidDate"
                  label="تاریخ پرداخت قبض"
                  value={bill.billPaidDate ?? null}
                  onChange={(v) => { if (v) void saveBill(setBillPaidDate(bill, v)); }}
                  defaultDate={today}
                  years={years}
                  clearable={false}
                  addLabel="تعیین تاریخ پرداخت"
                />
                {timing && due && paidDate && <div className={'timing-chip is-' + timing.timing}>{timing.label}</div>}
                <p className="bill-paid-card__hint">
                  قبض پرداخت‌شده قابل حذف نیست. تاریخ پرداخت فقط در گزارش «پرداخت قبض‌ها» نمایش داده می‌شود (نه در تصویر اشتراکی قبض).
                </p>
              </>
            ) : (
              <p className="bill-paid-card__hint">
                اگر مبلغ این قبض را (مثلاً به شرکت گاز) پرداخت کرده‌اید، تیک بزنید. این وضعیت جدا از پرداخت ساکنان است و در تصویر اشتراکی قبض نمایش داده نمی‌شود.
              </p>
            )}
          </section>
        )}

        {areaLine && totalArea > 0 && (
          <div className="ppm" role="status">
            <div>
              <div className="ppm__k">قیمت هر مترمربع</div>
              <div className="ppm__f num">{faMoney(bill.totalAmount)} ÷ {formatArea(totalArea)} م²</div>
            </div>
            <div className="ppm__v num">{ppmText} <span className="ppm__cur">{CURRENCY}</span></div>
          </div>
        )}
        <h2 className="section-title section-title--solo">واحدها</h2>
        <div className="table-card">
          <table className="table table--details">
            <thead>
              <tr>
                <th>واحد</th>
                {!areaLine && <th>{areaCol ? 'متراژ' : 'تعداد نفرات'}</th>}
                <th>مبلغ سهم</th>
                <th>پرداخت</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td className="unit-td">
                    <span className="num">{u.unitNumber}</span>
                    {u.alias && <span className="unit-td__alias">{u.alias}</span>}
                    {areaLine && !u.vacant && u.area != null && (
                      <span className="unit-td__alias num">{formatArea(u.area)} م² × {faMoney(Math.round(ppmExact))} · {toPersianDigits(Math.round((u.area / (totalArea || 1)) * 100))}٪</span>
                    )}
                  </td>
                  {!areaLine && <td className="num">{u.vacant ? <span className="no-share">{VACANT_LABEL}</span> : areaCol ? (u.area != null ? formatArea(u.area) : '—') : u.personCount}</td>}
                  <td className="num">{formatAmount(u.shareAmount)}</td>
                  <td>
                    {u.shareAmount === 0 ? (
                      <span className="no-share">{u.vacant ? VACANT_LABEL : 'بدون سهم'}</span>
                    ) : (<>
                    <button
                      type="button"
                      className={'pay-btn' + (u.isSettled ? ' is-settled' : '') + (deleted ? ' is-muted' : '')}
                      onClick={() => openPayment(u)}
                      aria-label={u.isSettled ? `${unitLabel(u.unitNumber, u.alias)} تسویه شده` : `پرداخت ${unitLabel(u.unitNumber, u.alias)}`}
                    >
                      {u.isSettled ? <><IconCheck size={15} /> تسویه</> : 'پرداخت'}
                    </button>
                    {!u.isSettled && paidAmount(u) > 0 && (
                      <div className="pay-remaining">مانده <span className="num">{formatAmount(remainingAmount(u))}</span></div>
                    )}
                    </>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={'status-box' + (locked ? ' is-settled' : '')}>
          <span className="status-box__k">وضعیت کلی:</span>
          <b>{locked ? 'تسویه شده' : 'تسویه نشده'}</b>
        </div>

        {deleted ? (
          <>
            <button type="button" className="btn btn--primary btn--block" onClick={() => void restore()}>
              <IconRestore size={18} />
              <span>بازگردانی</span>
            </button>
            <button type="button" className="btn btn--text-danger btn--block" onClick={() => void purge()}>
              <IconTrash size={17} />
              <span>حذف دائمی</span>
            </button>
          </>
        ) : (
          <>
            <BillImageActions data={data} />

            <button
              type="button"
              className={'btn btn--soft btn--block' + (locked ? ' is-disabled' : '')}
              aria-disabled={locked}
              onClick={edit}
            >
              {locked ? <IconLock size={18} /> : <IconEdit size={18} />}
              <span>ویرایش</span>
            </button>

            <button
              type="button"
              className={'btn btn--text-danger btn--block' + (deletable ? '' : ' is-disabled')}
              aria-disabled={!deletable}
              aria-describedby={deletable ? undefined : 'delete-blocked-note'}
              onClick={() => void remove()}
            >
              {deletable ? <IconTrash size={17} /> : <IconLock size={17} />}
              <span>حذف قبض</span>
            </button>
            {!deletable && <p id="delete-blocked-note" className="delete-blocked-note">{BillPaidMessages.deleteBlocked}</p>}
          </>
        )}
      </main>
      <PaymentDialog
        unit={payUnit}
        onClose={() => setPayUnit(null)}
        onSettleFully={(u) => void saveUnit(settleFully(u), `${unitLabel(u.unitNumber, u.alias)} تسویه شد.`)}
        onPay={(u, amount) => {
          const next = addPayment(u, amount);
          void saveUnit(next, next.isSettled ? `${unitLabel(u.unitNumber, u.alias)} تسویه شد.` : 'پرداخت ثبت شد.');
        }}
        onClear={(u) => void saveUnit(clearPayments(u), `پرداخت‌های ${unitLabel(u.unitNumber, u.alias)} حذف شد.`)}
      />
      <Dialog open={dueEdit !== undefined} onClose={() => setDueEdit(undefined)} labelledBy="due-title">
        <div className="dialog__icon dialog__icon--restore"><IconCalendar size={28} /></div>
        <h2 id="due-title" className="dialog__title">مهلت پرداخت</h2>
        <div className="due-dialog">
          <JalaliDateField
            id="dueEdit"
            label="مهلت پرداخت"
            hint="آخرین مهلت پرداخت قبض؛ از ۲ روز قبل، هشدار آن در صفحه اصلی برنامه نمایش داده می‌شود."
            value={dueEdit ?? null}
            onChange={(v) => setDueEdit(v)}
            defaultDate={addJalaliDays(today, DEFAULT_DUE_OFFSET_DAYS)}
            years={years}
            addLabel="افزودن مهلت پرداخت"
          />
        </div>
        <div className="dialog__actions dialog__actions--two">
          <button type="button" className="btn btn--primary" onClick={() => void saveDue()}>ذخیره</button>
          <button type="button" className="btn btn--muted" onClick={() => setDueEdit(undefined)}>انصراف</button>
        </div>
      </Dialog>
    </>
  );
}
