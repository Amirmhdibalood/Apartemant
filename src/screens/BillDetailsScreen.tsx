import { useEffect, useState } from 'react';
import type { BillDraft, BillWithUnits } from '../models/types';
import { CURRENCY, EXPENSE_TYPES, monthName } from '../models/constants';
import { AppHeader } from '../components/AppHeader';
import { ExpenseIcon } from '../components/ExpenseIcon';
import { Checkbox } from '../components/Checkbox';
import { IconEdit, IconLock, IconTrash } from '../components/Icons';
import { useFeedback } from '../context/FeedbackContext';
import { billRepository } from '../storage/billRepository';
import { formatAmount } from '../logic/formatting';
import { allSettled, wouldCompleteSettlement } from '../logic/settlement';
import { draftFromBill } from '../logic/billFactory';
import { Errors } from '../logic/errors';

interface Props {
  billId: string;
  onBack: () => void;
  onEdit: (draft: BillDraft) => void;
}

/** ۹، ۱۰ و ۱۱. جزئیات قبض + تسویه + قفل ویرایش */
export function BillDetailsScreen({ billId, onBack, onEdit }: Props) {
  const { showLocked, confirmWarning, confirmDanger, showErrors, toast } = useFeedback();
  const [data, setData] = useState<BillWithUnits | null | undefined>(undefined);

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
  const type = EXPENSE_TYPES[bill.expenseType];
  const locked = bill.isFullySettled;

  const toggleUnit = async (unitId: string, value: boolean) => {
    if (locked) { showLocked(); return; }
    if (value && wouldCompleteSettlement(units, unitId)) {
      if (!(await confirmWarning('lastUnitSettle'))) return;
    }
    const nextUnits = units.map((u) => (u.id === unitId ? { ...u, isSettled: value } : u));
    const nextBill = { ...bill, isFullySettled: allSettled(nextUnits) };
    try {
      await billRepository.upsert(nextBill, nextUnits);
      setData({ bill: nextBill, units: nextUnits });
    } catch {
      showErrors(Errors.storageFailed());
    }
  };

  const edit = () => {
    if (locked) { showLocked(); return; }
    onEdit(draftFromBill(data));
  };

  const remove = async () => {
    const ok = await confirmDanger({
      title: 'حذف قبض',
      text: 'آیا از حذف این قبض و همه واحدهای آن اطمینان دارید؟ این عمل قابل بازگشت نیست.',
      confirmLabel: 'حذف',
    });
    if (!ok) return;
    await billRepository.remove(bill.id);
    toast('قبض حذف شد.');
    onBack();
  };

  return (
    <>
      <AppHeader title="جزئیات قبض" onBack={onBack} />
      <main className="screen screen--details">
        <section className="summary-card">
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
            {bill.description && (
              <div className="kv kv--desc"><span className="kv__k">توضیحات:</span><span>{bill.description}</span></div>
            )}
          </div>
          <ExpenseIcon type={bill.expenseType} size={50} />
        </section>

        <h2 className="section-title section-title--solo">واحدها</h2>
        <div className="table-card">
          <table className="table table--details">
            <thead>
              <tr>
                <th>واحد</th>
                <th>تعداد نفرات</th>
                <th>مبلغ سهم</th>
                <th>وضعیت تسویه</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td className="num">{u.unitNumber}</td>
                  <td className="num">{u.personCount}</td>
                  <td className="num">{formatAmount(u.shareAmount)}</td>
                  <td>
                    <Checkbox
                      className="settle-check"
                      checked={u.isSettled}
                      onChange={(v) => void toggleUnit(u.id, v)}
                      label="تسویه"
                      ariaLabel={`تسویه واحد ${u.unitNumber}`}
                    />
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

        <button
          type="button"
          className={'btn btn--soft btn--block' + (locked ? ' is-disabled' : '')}
          aria-disabled={locked}
          onClick={edit}
        >
          {locked ? <IconLock size={18} /> : <IconEdit size={18} />}
          <span>ویرایش</span>
        </button>

        <button type="button" className="btn btn--text-danger btn--block" onClick={remove}>
          <IconTrash size={17} />
          <span>حذف قبض</span>
        </button>
      </main>
    </>
  );
}
