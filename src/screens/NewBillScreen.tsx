import { useEffect, useState } from 'react';
import type { BillDraft } from '../models/types';
import { MONTHS } from '../models/constants';
import { AppHeader } from '../components/AppHeader';
import { SelectField } from '../components/SelectField';
import { JalaliDateField } from '../components/JalaliDateField';
import { addJalaliDays, dateYearOptions, todayJalali } from '../logic/jalali';
import { DEFAULT_DUE_OFFSET_DAYS } from '../logic/billStatus';
import { ExpenseTypePicker } from '../components/ExpenseTypePicker';
import { AmountInput } from '../components/AmountInput';
import { UnitsEditor } from '../components/UnitsEditor';
import { useSettings } from '../context/SettingsContext';
import { useFeedback } from '../context/FeedbackContext';
import { validateDraft } from '../logic/validation';
import { CURRENCY, SPLIT_METHOD_LABELS } from '../models/constants';
import { defaultSplitFor, type SplitDefaults } from '../logic/split';
import { splitDefaultsRepository } from '../storage/splitDefaultsRepository';
import { DEFAULT_PERSON_COUNT } from '../logic/billFactory';

interface Props {
  draft: BillDraft;
  setDraft: (d: BillDraft) => void;
  onBack: () => void;
  onCalculated: () => void;
}

/** ۲، ۳ و ۴. ثبت / ویرایش قبض (یک فرم مشترک) */
export function NewBillScreen({ draft, setDraft, onBack, onCalculated }: Props) {
  const { settings } = useSettings();
  const { showErrors } = useFeedback();
  const set = (patch: Partial<BillDraft>) => setDraft({ ...draft, ...patch });
  const [splitDefaults, setSplitDefaults] = useState<SplitDefaults>({});
  useEffect(() => {
    let alive = true;
    splitDefaultsRepository.get().then((d) => { if (alive) setSplitDefaults(d); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  // فقط سال‌های فعال (+ سال قبض در حال ویرایش، اگر غیرفعال شده باشد)
  const today = todayJalali();
  const years = Array.from(new Set([...settings.activeYears, draft.year])).filter(
    (y) => settings.activeYears.includes(y) || (draft.editingBillId !== null && y === draft.year),
  ).sort((a, b) => a - b);

  const submit = () => {
    const res = validateDraft(draft);
    if (!res.ok) {
      showErrors(res.errors);
      return;
    }
    onCalculated();
  };

  return (
    <>
      <AppHeader title={draft.editingBillId ? 'ویرایش قبض' : 'ثبت قبض جدید'} onBack={onBack} />
      <main className="screen screen--form">
        <SelectField
          id="year"
          label="سال"
          value={draft.year}
          options={years.map((y) => ({ value: y, label: String(y) }))}
          onChange={(year) => set({ year })}
        />
        <SelectField
          id="month"
          label="ماه"
          value={draft.month}
          options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))}
          onChange={(month) => set({ month })}
        />

        <div className="field">
          <span className="field__label">نوع هزینه</span>
          <ExpenseTypePicker
            value={draft.expenseType}
            onChange={(expenseType) =>
              set({
                expenseType,
                // تا وقتی کاربر خودش انتخاب نکرده، نحوه تقسیم از آخرین روش همین نوع هزینه پیروی می‌کند
                ...(draft.editingBillId || draft.splitChosen ? {} : { splitMethod: defaultSplitFor(expenseType, splitDefaults) }),
              })
            }
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="billNumber">
            شماره قبض <span className="field__optional">(اختیاری)</span>
          </label>
          <input
            id="billNumber"
            className="input"
            type="text"
            autoComplete="off"
            value={draft.billNumber}
            placeholder="مثال: ۱۲۳۴۵۶۷۸"
            onChange={(e) => set({ billNumber: e.target.value })}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="description">
            توضیحات <span className="field__optional">(اختیاری)</span>
          </label>
          <textarea
            id="description"
            className="input textarea"
            rows={1}
            value={draft.description}
            placeholder="در صورت نیاز توضیحات را وارد کنید..."
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>

        <JalaliDateField
          id="dueDate"
          label="مهلت پرداخت"
          hint="آخرین مهلت پرداخت قبض؛ یک روز قبل از آن یادآوری نمایش داده می‌شود."
          optional
          value={draft.dueDate ?? null}
          onChange={(dueDate) => set({ dueDate })}
          defaultDate={addJalaliDays(today, DEFAULT_DUE_OFFSET_DAYS)}
          years={dateYearOptions(draft.year, today.year, today.year + 1)}
          addLabel="افزودن مهلت پرداخت"
        />

        <div className="field">
          <label className="field__label" htmlFor="amount">مبلغ قبض</label>
          <AmountInput
            id="amount"
            digits={draft.amountDigits}
            onChange={(amountDigits) => set({ amountDigits })}
            placeholder="مثال: 5,000,000"
            suffix={CURRENCY}
          />
        </div>

        {!draft.editingBillId && draft.prefilledUnits ? (
          <div className="prefill-note" role="status">
            <p className="prefill-note__text">
              واحدها و تعداد نفرات از آخرین قبض ثبت‌شده وارد شد (<span className="num">{draft.prefilledUnits}</span> واحد). در صورت
              نیاز برای این قبض تغییر دهید.
            </p>
            <button
              type="button"
              className="prefill-note__reset"
              onClick={() => set({ personCounts: [DEFAULT_PERSON_COUNT], prefilledUnits: undefined })}
            >
              شروع از صفر
            </button>
          </div>
        ) : null}

        <div className="field split-field">
          <span className="field__label" id="split-label">نحوه تقسیم</span>
          <div className="seg" role="radiogroup" aria-labelledby="split-label">
            {(['perPerson', 'perUnit'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={draft.splitMethod === m}
                className={'seg__btn' + (draft.splitMethod === m ? ' is-active' : '')}
                onClick={() => set({ splitMethod: m, splitChosen: true })}
              >
                {SPLIT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
          {draft.splitMethod === 'perUnit' && (
            <p className="split-hint">هر واحد یک سهم برابر دارد و تعداد نفرات در محاسبه اثری ندارد (نفرات واحدها حفظ می‌شود).</p>
          )}
        </div>

        <UnitsEditor
          personCounts={draft.personCounts}
          onChange={(personCounts) => set({ personCounts })}
          perUnit={draft.splitMethod === 'perUnit'}
        />
      </main>
      <div className="sticky-action">
        <button type="button" className="btn btn--primary btn--block btn--lg" onClick={submit}>
          محاسبه و ادامه
        </button>
      </div>
    </>
  );
}
