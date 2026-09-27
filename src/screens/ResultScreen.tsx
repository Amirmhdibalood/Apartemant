import { useEffect, useMemo, useRef, useState } from 'react';
import type { BillDraft, BillWithUnits } from '../models/types';
import { CURRENCY, EXPENSE_TYPES, SPLIT_METHOD_LABELS, monthName } from '../models/constants';
import { AppHeader } from '../components/AppHeader';
import { ExpenseIcon } from '../components/ExpenseIcon';
import { IconCalendarSave, IconMinus, IconPlus, IconTrash, IconUser } from '../components/Icons';
import { useFeedback } from '../context/FeedbackContext';
import { validateDraft } from '../logic/validation';
import { calculateBySplit } from '../logic/split';
import { splitDefaultsRepository } from '../storage/splitDefaultsRepository';
import { formatAmount } from '../logic/formatting';
import { buildBill } from '../logic/billFactory';
import { Errors } from '../logic/errors';
import { billRepository } from '../storage/billRepository';
import { unitTemplateRepository } from '../storage/unitTemplateRepository';

interface Props {
  draft: BillDraft;
  setDraft: (d: BillDraft) => void;
  onBack: () => void;
  onSaved: (saved: BillWithUnits) => void;
}

/** ۵، ۶ و ۷. نتیجه محاسبه + ذخیره */
export function ResultScreen({ draft, setDraft, onBack, onSaved }: Props) {
  const { showErrors, confirmWarning, toast } = useFeedback();
  const [saving, setSaving] = useState(false);
  const roundingShownFor = useRef<string>('');

  const validation = useMemo(() => validateDraft(draft), [draft]);
  const calc = useMemo(() => {
    if (!validation.ok) return null;
    return calculateBySplit(validation.value.totalAmount, validation.value.personCounts, draft.splitMethod);
  }, [validation, draft.splitMethod]);

  // اگر فرم نامعتبر شد (مثلاً همه واحدها حذف شدند) به فرم برگرد
  useEffect(() => {
    if (!validation.ok) onBack();
  }, [validation, onBack]);

  // هشدار گرد کردن (فقط یک‌بار برای هر ترکیب مبلغ/نفرات)
  useEffect(() => {
    if (!calc || calc.remainder === 0) return;
    const key = `${calc.totalAmount}|${calc.splitMethod}|${calc.shares.map((s) => s.personCount).join(',')}`;
    if (roundingShownFor.current === key) return;
    roundingShownFor.current = key;
    void confirmWarning('roundingAdjust');
  }, [calc, confirmWarning]);

  if (!calc || !draft.expenseType) return null;
  const type = EXPENSE_TYPES[draft.expenseType];

  const removeUnit = (index: number) => {
    if (draft.personCounts.length <= 1) {
      showErrors(Errors.minOneUnit());
      return;
    }
    setDraft({ ...draft, personCounts: draft.personCounts.filter((_, i) => i !== index) });
  };

  const addUnit = () => {
    // برای واحد جدید باید تعداد نفرات تایپ شود، پس به فرم برمی‌گردیم
    setDraft({ ...draft, personCounts: [...draft.personCounts, ''] });
    onBack();
  };

  const save = async () => {
    if (saving) return;
    const existing = draft.editingBillId ? await billRepository.getById(draft.editingBillId) : null;
    if (existing?.bill.isFullySettled) return; // قبض تسویه‌شده قابل ویرایش نیست
    if (!existing) {
      const sameMonth = await billRepository.findByYearMonth(draft.year, draft.month);
      if (sameMonth.some((x) => x.bill.expenseType === draft.expenseType)) {
        if (!(await confirmWarning('duplicateBill'))) return;
      }
    }
    if (!(await confirmWarning('saveConfirm'))) return;
    setSaving(true);
    try {
      const saved = buildBill(draft, calc, existing);
      await billRepository.upsert(saved.bill, saved.units);
      // واحدهای این قبض، الگوی پیش‌فرض قبض بعدی می‌شوند
      await unitTemplateRepository.save(saved.units.map((u) => u.personCount)).catch(() => undefined);
      // نحوه تقسیم، پیش‌فرض قبض‌های بعدی همین نوع هزینه می‌شود
      await splitDefaultsRepository.remember(saved.bill.expenseType, calc.splitMethod).catch(() => undefined);
      toast('اطلاعات با موفقیت ذخیره شد.');
      onSaved(saved);
    } catch {
      showErrors(Errors.storageFailed());
    } finally {
      setSaving(false);
    }
  };

  const perUnit = calc.splitMethod === 'perUnit';
  const perPerson = calc.isExact
    ? formatAmount(calc.perPersonExact)
    : '≈ ' + formatAmount(Math.round(calc.perPersonExact));

  return (
    <>
      <AppHeader title="نتیجه محاسبه" onBack={onBack} />
      <main className="screen screen--result">
        <section className="summary-card">
          <div className="summary-card__body">
            <h2 className="summary-card__title">
              {type.label} - {monthName(draft.month)} {draft.year}
            </h2>
            <div className="kv"><span className="kv__k">مبلغ کل قبض:</span><b className="num">{formatAmount(calc.totalAmount)}</b> {CURRENCY}</div>
            <div className="kv"><span className="kv__k">نحوه تقسیم:</span><span className={'split-badge is-' + calc.splitMethod}>{SPLIT_METHOD_LABELS[calc.splitMethod]}</span></div>
            {perUnit ? (
              <>
                <div className="kv"><span className="kv__k">تعداد واحدها:</span><b className="num">{calc.totalPersons}</b> واحد</div>
                <div className="kv"><span className="kv__k">سهم هر واحد:</span><b className="num">{perPerson}</b> {CURRENCY}</div>
              </>
            ) : (
              <>
                <div className="kv"><span className="kv__k">مجموع نفرات:</span><b className="num">{calc.totalPersons}</b> نفر</div>
                <div className="kv"><span className="kv__k">هزینه هر نفر:</span><b className="num">{perPerson}</b> {CURRENCY}</div>
              </>
            )}
          </div>
          <ExpenseIcon type={draft.expenseType} size={46} plain />
        </section>

        <div className="section-head">
          <h2 className="section-title">واحدها</h2>
          <div className="section-head__actions">
            <button type="button" className="square-btn square-btn--red" aria-label="حذف آخرین واحد" onClick={() => removeUnit(draft.personCounts.length - 1)}>
              <IconMinus size={18} strokeWidth={3} />
            </button>
            <button type="button" className="square-btn square-btn--green" aria-label="افزودن واحد" onClick={addUnit}>
              <IconPlus size={18} strokeWidth={3} />
            </button>
          </div>
        </div>

        <div className="table-card">
          <table className="table table--result">
            <thead>
              <tr>
                <th className="col-unit">واحد</th>
                {!perUnit && <th className="col-count">تعداد نفرات</th>}
                <th>مبلغ سهم</th>
                <th className="col-action" aria-label="حذف" />
              </tr>
            </thead>
            <tbody>
              {calc.shares.map((s, i) => (
                <tr key={s.unitNumber}>
                  <td className="col-unit">
                    <span className="unit-cell">
                      <span className="unit-avatar"><IconUser size={16} /></span>
                      واحد {s.unitNumber}
                    </span>
                  </td>
                  {!perUnit && <td className="col-count num">{s.personCount}</td>}
                  <td className="num strong">{formatAmount(s.shareAmount)}</td>
                  <td className="col-action">
                    <button type="button" className="icon-btn icon-btn--danger" aria-label={`حذف واحد ${s.unitNumber}`} onClick={() => removeUnit(i)}>
                      <IconTrash size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="total-card">
          <span>جمع کل</span>
          <span><b className="num">{formatAmount(calc.shares.reduce((a, s) => a + s.shareAmount, 0))}</b> {CURRENCY}</span>
        </section>
      </main>
      <div className="sticky-action">
        <button type="button" className="btn btn--success btn--block btn--lg btn--with-icon" onClick={save} disabled={saving}>
          <span>ذخیره</span>
          <IconCalendarSave size={22} className="btn__icon-start" />
        </button>
      </div>
    </>
  );
}
