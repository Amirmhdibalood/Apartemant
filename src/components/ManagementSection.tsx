import { useCallback, useEffect, useState } from 'react';
import { buildingRepository, type ManagementPeriodRow } from '../storage/buildingRepository';
import { JalaliDateField } from './JalaliDateField';
import { selectableYears } from '../logic/years';
import { useFeedback } from '../context/FeedbackContext';
import { Errors } from '../logic/errors';
import { toPersianDigits } from '../logic/formatting';
import { parseJalaliKey, todayJalali } from '../logic/jalali';

export function ManagementSection({ reloadKey = 0 }: { reloadKey?: number }) {
  const { toast, showErrors, confirmDanger } = useFeedback();
  const [rows, setRows] = useState<ManagementPeriodRow[]>([]);
  const [label, setLabel] = useState('');
  const today = todayJalali();
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const years = selectableYears();

  const reload = useCallback(async () => {
    setRows(await buildingRepository.listManagementPeriods());
  }, []);

  useEffect(() => { void reload().catch(() => undefined); }, [reload, reloadKey]);
  useEffect(() => buildingRepository.onActiveChange(() => { void reload(); }), [reload]);

  const add = async () => {
    const name = label.trim();
    if (!name) { showErrors(Errors.requiredMissing('نام مدیر')); return; }
    if (!start || !end || !parseJalaliKey(start) || !parseJalaliKey(end)) {
      showErrors(Errors.backupInvalid('تاریخ شروع و پایان را مشخص کنید.'));
      return;
    }
    if (start > end) { showErrors(Errors.backupInvalid('تاریخ پایان نباید قبل از شروع باشد.')); return; }
    try {
      await buildingRepository.addManagementPeriod({
        managerLabel: name,
        startDate: start,
        endDate: end,
        endPreviousEarly: true,
      });
      setLabel('');
      toast('دورهٔ مدیریت ثبت شد.');
      await reload();
    } catch {
      showErrors(Errors.storageFailed());
    }
  };

  const endEarly = async (id: string) => {
    if (!(await confirmDanger({
      title: 'تعویض مدیر',
      text: 'دورهٔ فعلی زودتر از موعد بسته می‌شود تا بتوانید مدیر جدید ثبت کنید. ادامه می‌دهید؟',
      confirmLabel: 'بستن دوره',
    }))) return;
    await buildingRepository.endManagementEarly(id);
    toast('دوره زودتر بسته شد.');
    await reload();
  };


  return (
    <div className="mgmt-card">
      <p className="card__hint">
        دورهٔ مدیریت و تاریخچهٔ مدیران این ساختمان. می‌توانید مدیر را قبل از پایان دوره عوض کنید؛ تاریخچه حذف نمی‌شود.
      </p>

      <label className="field">
        <span className="field__label">نام / عنوان مدیر</span>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value.slice(0, 80))} placeholder="مثلاً آقای رضایی" />
      </label>
      <JalaliDateField id="mgmt-start" label="شروع دوره" value={start} onChange={setStart} defaultDate={today} years={years} addLabel="افزودن تاریخ شروع" />
      <JalaliDateField id="mgmt-end" label="پایان دوره" value={end} onChange={setEnd} defaultDate={today} years={years} addLabel="افزودن تاریخ پایان" />
      <button type="button" className="btn btn--primary" onClick={() => void add()}>ثبت دوره / مدیر جدید</button>

      <h3 className="settings-sub">تاریخچه</h3>
      {rows.length === 0 ? (
        <p className="card__hint">هنوز دوره‌ای ثبت نشده است.</p>
      ) : (
        <ul className="mgmt-list">
          {rows.map((r) => (
            <li key={r.id} className="mgmt-list__row">
              <div>
                <strong>{r.managerLabel}</strong>
                <div className="card__hint">
                  {toPersianDigits(r.startDate)} تا {toPersianDigits(r.endDate)}
                  {r.endedEarlyAt ? ' · زودتر بسته شده' : ''}
                </div>
              </div>
              <div className="mgmt-list__actions">
                {!r.endedEarlyAt && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => void endEarly(r.id)}>بستن زودهنگام</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
