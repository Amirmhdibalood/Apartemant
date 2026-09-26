import type { BillDraft } from '../models/types';
import { MONTHS } from '../models/constants';
import { AppHeader } from '../components/AppHeader';
import { SelectField } from '../components/SelectField';
import { ExpenseTypePicker } from '../components/ExpenseTypePicker';
import { AmountInput } from '../components/AmountInput';
import { UnitsEditor } from '../components/UnitsEditor';
import { useSettings } from '../context/SettingsContext';
import { useFeedback } from '../context/FeedbackContext';
import { validateDraft } from '../logic/validation';
import { CURRENCY } from '../models/constants';
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

  // فقط سال‌های فعال (+ سال قبض در حال ویرایش، اگر غیرفعال شده باشد)
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
          <ExpenseTypePicker value={draft.expenseType} onChange={(expenseType) => set({ expenseType })} />
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

        <UnitsEditor
          personCounts={draft.personCounts}
          onChange={(personCounts) => set({ personCounts })}
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
