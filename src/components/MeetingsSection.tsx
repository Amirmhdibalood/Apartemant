import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildingRepository,
  type MeetingAttendanceRow,
  type MeetingAttendanceStatus,
  type MeetingRow,
} from '../storage/buildingRepository';
import { JalaliDateField } from './JalaliDateField';
import { OptionPicker } from './OptionPicker';
import { selectableYears } from '../logic/years';
import { useFeedback } from '../context/FeedbackContext';
import { Errors } from '../logic/errors';
import { toPersianDigits } from '../logic/formatting';
import { formatJalaliKey, jalaliWeekdayFa, parseJalaliKey, todayJalali } from '../logic/jalali';
import { callUnit, smsUnits } from '../logic/contactActions';
import { IconPhone } from './Icons';

type View = 'hub' | 'schedule' | 'attendance' | 'summary' | 'detail';

type DraftAtt = Record<number, MeetingAttendanceStatus | undefined>;

const STATUS_FA: Record<MeetingAttendanceStatus, string> = {
  present: 'حاضر',
  absent: 'غایب',
  empty: 'خالی',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTime(hour: number, minute: number): string {
  return toPersianDigits(`${pad2(hour)}:${pad2(minute)}`);
}

function countAtt(rows: { status: MeetingAttendanceStatus }[]) {
  let present = 0, absent = 0, empty = 0;
  for (const r of rows) {
    if (r.status === 'present') present += 1;
    else if (r.status === 'absent') absent += 1;
    else empty += 1;
  }
  return { present, absent, empty };
}

function unitLabel(n: number, alias: string | null | undefined): string {
  const base = `واحد ${toPersianDigits(String(n))}`;
  return alias?.trim() ? `${base} — ${alias.trim()}` : base;
}

export function MeetingsSection({ reloadKey = 0 }: { reloadKey?: number }) {
  const { toast, showErrors, confirmDanger } = useFeedback();
  const [view, setView] = useState<View>('hub');
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [units, setUnits] = useState<{ number: number; alias: string | null; phone: string | null }[]>([]);
  const [detail, setDetail] = useState<MeetingRow | null>(null);
  const [busy, setBusy] = useState(false);

  const years = selectableYears();
  const today = todayJalali();
  const [date, setDate] = useState<string | null>(() => formatJalaliKey(today));
  const [hour, setHour] = useState(18);
  const [minute, setMinute] = useState(30);
  const [place, setPlace] = useState('');
  const [att, setAtt] = useState<DraftAtt>({});
  const [summary, setSummary] = useState('');
  const [smsBody, setSmsBody] = useState('');
  const [smsOpen, setSmsOpen] = useState(false);

  const weekday = useMemo(() => {
    const d = parseJalaliKey(date);
    return d ? jalaliWeekdayFa(d) : '—';
  }, [date]);

  const reload = useCallback(async () => {
    setRows(await buildingRepository.listMeetings());
    const b = await buildingRepository.get();
    setUnits(b.units.map((u, i) => ({ number: i + 1, alias: u.alias ?? null, phone: u.phone ?? null })));
  }, []);

  useEffect(() => { void reload().catch(() => undefined); }, [reload, reloadKey]);
  useEffect(() => buildingRepository.onActiveChange(() => {
    setView('hub');
    setDetail(null);
    void reload();
  }), [reload]);

  const resetDraft = () => {
    setDate(formatJalaliKey(todayJalali()));
    setHour(18);
    setMinute(30);
    setPlace('');
    setAtt({});
    setSummary('');
  };

  const startNew = () => {
    resetDraft();
    setView('schedule');
  };

  const goAttendance = () => {
    if (!date || !parseJalaliKey(date)) {
      showErrors(Errors.backupInvalid('تاریخ جلسه را مشخص کنید.'));
      return;
    }
    setView('attendance');
  };

  const goSummary = () => setView('summary');

  const save = async () => {
    if (!date || !parseJalaliKey(date)) {
      showErrors(Errors.backupInvalid('تاریخ جلسه را مشخص کنید.'));
      return;
    }
    const attendance: MeetingAttendanceRow[] = units
      .map((u) => {
        const status = att[u.number];
        if (!status) return null;
        return { unitNumber: u.number, unitAlias: u.alias, status } satisfies MeetingAttendanceRow;
      })
      .filter((x): x is MeetingAttendanceRow => x != null);

    setBusy(true);
    try {
      await buildingRepository.addMeeting({
        meetingDate: date,
        weekday,
        hour,
        minute,
        place: place.trim() || null,
        summary: summary.trim() || null,
        attendance,
      });
      toast('جلسه در لاگ ذخیره شد.');
      resetDraft();
      setView('hub');
      await reload();
    } catch {
      showErrors(Errors.storageFailed());
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (id: string) => {
    const m = await buildingRepository.getMeeting(id);
    if (!m) { showErrors(Errors.backupInvalid('جلسه پیدا نشد.')); return; }
    setDetail(m);
    setView('detail');
  };

  const removeMeeting = async (id: string) => {
    if (!(await confirmDanger({
      title: 'حذف جلسه',
      text: 'این جلسه از تاریخچه حذف می‌شود.',
      confirmLabel: 'حذف',
    }))) return;
    await buildingRepository.removeMeeting(id);
    toast('جلسه حذف شد.');
    setDetail(null);
    setView('hub');
    await reload();
  };

  const hourOpts = useMemo(
    () => Array.from({ length: 24 }, (_, i) => ({ value: i, label: pad2(i) })),
    [],
  );
  const minuteOpts = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: i * 5, label: pad2(i * 5) })),
    [],
  );

  if (view === 'schedule') {
    return (
      <div className="meet-card">
        <button type="button" className="btn btn--ghost btn--sm meet-back" onClick={() => setView('hub')}>بازگشت</button>
        <h3 className="settings-sub">ثبت جلسهٔ جدید</h3>
        <p className="card__hint">تاریخ شمسی با همان کشوهای برنامه، روز هفته خودکار، و ساعت.</p>
        <JalaliDateField
          id="meet-date"
          label="تاریخ جلسه"
          value={date}
          onChange={setDate}
          defaultDate={today}
          years={years}
          addLabel="افزودن تاریخ جلسه"
          clearable={false}
        />
        <p className="meet-weekday" role="status">روز هفته: {weekday}</p>
        <div className="meet-time">
          <OptionPicker id="meet-hour" label="ساعت" value={hour} options={hourOpts} onChange={(v) => setHour(Number(v))} />
          <OptionPicker id="meet-min" label="دقیقه" value={minute} options={minuteOpts} onChange={(v) => setMinute(Number(v))} />
        </div>
        <label className="field">
          <span className="field__label">محل / یادداشت (اختیاری)</span>
          <input className="input" value={place} onChange={(e) => setPlace(e.target.value.slice(0, 120))} placeholder="مثلاً لابی ساختمان" />
        </label>
        <button type="button" className="btn btn--primary" onClick={goAttendance}>ادامه — حضور و غیاب</button>
      </div>
    );
  }

  if (view === 'attendance') {
    return (
      <div className="meet-card">
        <button type="button" className="btn btn--ghost btn--sm meet-back" onClick={() => setView('schedule')}>بازگشت</button>
        <h3 className="settings-sub">حضور و غیاب</h3>
        <p className="meet-meta">
          {toPersianDigits(date ?? '')} · {weekday} · {formatTime(hour, minute)}
        </p>
        <p className="card__hint">جلوی هر واحد یکی را بزنید. تا انتخاب نشود، وضعیت نامشخص می‌ماند.</p>
        {units.length === 0 ? (
          <p className="card__hint">اول در «ساختمان‌ها» واحدها را تعریف کنید.</p>
        ) : (
          <ul className="meet-units">
            {units.map((u) => {
              const cur = att[u.number];
              return (
                <li key={u.number} className="meet-unit">
                  <div className="meet-unit__head">
                    <div className="meet-unit__name">{unitLabel(u.number, u.alias)}</div>
                    {u.phone ? (
                      <button type="button" className="btn btn--ghost btn--sm meet-call" aria-label={`تماس با واحد ${u.number}`} onClick={() => callUnit(u.phone!)}>
                        <IconPhone size={16} /> تماس
                      </button>
                    ) : null}
                  </div>
                  <div className="meet-att" role="group" aria-label={`حضور واحد ${u.number}`}>
                    {(['present', 'absent', 'empty'] as MeetingAttendanceStatus[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={'meet-att__btn' + (cur === s ? ` is-${s}` : '')}
                        aria-pressed={cur === s}
                        onClick={() => setAtt((prev) => ({ ...prev, [u.number]: s }))}
                      >
                        {STATUS_FA[s]}
                      </button>
                    ))}
                  </div>
                  {!cur && <div className="card__hint">هنوز انتخاب نشده</div>}
                </li>
              );
            })}
          </ul>
        )}
        {units.some((u) => u.phone) && (
          <div className="meet-sms">
            {!smsOpen ? (
              <button type="button" className="btn btn--soft btn--block" onClick={() => setSmsOpen(true)}>ارسال پیامک برای همهٔ شماره‌دارها</button>
            ) : (
              <>
                <label className="field">
                  <span className="field__label">متن پیامک</span>
                  <textarea
                    className="input meet-summary"
                    rows={3}
                    value={smsBody}
                    onChange={(e) => setSmsBody(e.target.value.slice(0, 500))}
                    placeholder="مثلاً یادآوری جلسهٔ امروز ساعت ۱۸…"
                  />
                </label>
                <p className="card__hint">اپ پیامک دستگاه باز می‌شود؛ ممکن است مجوز پیامک بخواهد. فقط واحدهایی که تلفن دارند انتخاب می‌شوند.</p>
                <div className="meet-sms__actions">
                  <button type="button" className="btn btn--primary" onClick={() => {
                    const phones = units.map((u) => u.phone).filter((x): x is string => !!x);
                    if (!phones.length) { showErrors(Errors.backupInvalid('هیچ شماره‌ای ثبت نشده است.')); return; }
                    if (!smsBody.trim()) { showErrors(Errors.backupInvalid('متن پیامک را بنویسید.')); return; }
                    smsUnits(phones, smsBody.trim());
                    toast('اپ پیامک باز شد.');
                  }}>باز کردن پیامک</button>
                  <button type="button" className="btn btn--ghost" onClick={() => setSmsOpen(false)}>بستن</button>
                </div>
              </>
            )}
          </div>
        )}
        <button type="button" className="btn btn--primary" onClick={goSummary}>ادامه — خلاصه جلسه</button>
      </div>
    );
  }

  if (view === 'summary') {
    const chosen = units
      .map((u) => (att[u.number] ? { status: att[u.number]! } : null))
      .filter((x): x is { status: MeetingAttendanceStatus } => x != null);
    const c = countAtt(chosen);
    const unset = units.length - chosen.length;
    return (
      <div className="meet-card">
        <button type="button" className="btn btn--ghost btn--sm meet-back" onClick={() => setView('attendance')}>بازگشت</button>
        <h3 className="settings-sub">خلاصه جلسه</h3>
        <div className="meet-chips" aria-label="جمع حضور">
          <span className="meet-chip meet-chip--present">حاضر {toPersianDigits(String(c.present))}</span>
          <span className="meet-chip meet-chip--absent">غایب {toPersianDigits(String(c.absent))}</span>
          <span className="meet-chip meet-chip--empty">خالی {toPersianDigits(String(c.empty))}</span>
          {unset > 0 && <span className="meet-chip">نامشخص {toPersianDigits(String(unset))}</span>}
        </div>
        <label className="field">
          <span className="field__label">شرح جلسه / مصوبات</span>
          <textarea
            className="input meet-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value.slice(0, 4000))}
            placeholder="مثلاً تعمیر آسانسور از صندوق؛ نظافت هفته‌ای دوبار…"
            rows={5}
          />
        </label>
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void save()}>ذخیره در لاگ</button>
      </div>
    );
  }

  if (view === 'detail' && detail) {
    const c = countAtt(detail.attendance);
    return (
      <div className="meet-card">
        <button type="button" className="btn btn--ghost btn--sm meet-back" onClick={() => { setDetail(null); setView('hub'); }}>بازگشت به تاریخچه</button>
        <h3 className="settings-sub">جزئیات جلسه</h3>
        <p className="meet-meta">
          <strong>{toPersianDigits(detail.meetingDate)}</strong>
          {' · '}{detail.weekday}
          {' · '}{formatTime(detail.hour, detail.minute)}
          {detail.place ? ` · ${detail.place}` : ''}
        </p>
        <div className="meet-chips">
          <span className="meet-chip meet-chip--present">حاضر {toPersianDigits(String(c.present))}</span>
          <span className="meet-chip meet-chip--absent">غایب {toPersianDigits(String(c.absent))}</span>
          <span className="meet-chip meet-chip--empty">خالی {toPersianDigits(String(c.empty))}</span>
        </div>
        <ul className="meet-units">
          {detail.attendance.length === 0 ? (
            <li className="card__hint">حضوری ثبت نشده است.</li>
          ) : (
            detail.attendance.map((a) => {
              const phone = units.find((u) => u.number === a.unitNumber)?.phone ?? null;
              return (
              <li key={a.unitNumber} className="meet-unit meet-unit--readonly">
                <span className="meet-unit__name">{unitLabel(a.unitNumber, a.unitAlias)}</span>
                <span className="meet-unit__actions">
                  {phone ? (
                    <button type="button" className="btn btn--ghost btn--sm meet-call" onClick={() => callUnit(phone)}>
                      <IconPhone size={16} /> تماس
                    </button>
                  ) : null}
                  <span className={`meet-chip meet-chip--${a.status}`}>{STATUS_FA[a.status]}</span>
                </span>
              </li>
              );
            })
          )}
        </ul>
        <h3 className="settings-sub">خلاصه</h3>
        <p className="meet-summary-text">{detail.summary?.trim() || 'خلاصه‌ای نوشته نشده است.'}</p>
        {units.some((u) => u.phone) && (
          <div className="meet-sms">
            {!smsOpen ? (
              <button type="button" className="btn btn--soft btn--block" onClick={() => setSmsOpen(true)}>ارسال پیامک برای همهٔ شماره‌دارها</button>
            ) : (
              <>
                <label className="field">
                  <span className="field__label">متن پیامک</span>
                  <textarea className="input meet-summary" rows={3} value={smsBody} onChange={(e) => setSmsBody(e.target.value.slice(0, 500))} />
                </label>
                <button type="button" className="btn btn--primary" onClick={() => {
                  const phones = units.map((u) => u.phone).filter((x): x is string => !!x);
                  if (!smsBody.trim()) { showErrors(Errors.backupInvalid('متن پیامک را بنویسید.')); return; }
                  smsUnits(phones, smsBody.trim());
                  toast('اپ پیامک باز شد.');
                }}>باز کردن پیامک</button>
              </>
            )}
          </div>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void removeMeeting(detail.id)}>حذف این جلسه</button>
      </div>
    );
  }

  return (
    <div className="meet-card">
      <p className="card__hint">
        برای ساختمان فعال. تاریخ و ساعت را ثبت کنید، حضور واحدها را مشخص کنید، بعد خلاصه بنویسید. همه در لاگ می‌ماند.
        درخواست جلسه از طرف واحدها فعلاً نیست؛ چون فقط مدیر اپ را دارد.
      </p>
      <button type="button" className="btn btn--primary" onClick={startNew}>ثبت جلسهٔ جدید</button>

      <h3 className="settings-sub">تاریخچه جلسات</h3>
      {rows.length === 0 ? (
        <p className="card__hint">هنوز جلسه‌ای ثبت نشده است.</p>
      ) : (
        <ul className="meet-log">
          {rows.map((r) => {
            const c = countAtt(r.attendance);
            return (
              <li key={r.id}>
                <button type="button" className="meet-log__btn" onClick={() => void openDetail(r.id)}>
                  <strong>{toPersianDigits(r.meetingDate)} · {formatTime(r.hour, r.minute)}</strong>
                  <div className="card__hint">{r.weekday}{r.place ? ` · ${r.place}` : ''}</div>
                  <div className="meet-chips">
                    <span className="meet-chip meet-chip--present">حاضر {toPersianDigits(String(c.present))}</span>
                    <span className="meet-chip meet-chip--absent">غایب {toPersianDigits(String(c.absent))}</span>
                    <span className="meet-chip meet-chip--empty">خالی {toPersianDigits(String(c.empty))}</span>
                  </div>
                  {r.summary ? <div className="card__hint meet-log__sum">خلاصه: {r.summary.slice(0, 80)}{r.summary.length > 80 ? '…' : ''}</div> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
