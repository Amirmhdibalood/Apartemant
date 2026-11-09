/**
 * «دوره‌ها» (۱.۹، از کارت صفحهٔ اصلی): زبانه‌های «سال‌ها» و «مدیر ساختمان» برای ساختمان فعال.
 * سال‌ها (۱.۹.۱) خودکارند و فقط پنهان/نمایش دارند. بستن دورهٔ مدیریت برگشت ندارد و قبض‌های دورهٔ بسته قفل می‌شوند
 * (ویرایش، حذف، تیک «پرداخت شد» و مهلت پرداخت)، ولی ثبت پرداخت واحدها همچنان ممکن است.
 */
import { useEffect, useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { Switch } from '../components/Switch';
import { OptionPicker } from '../components/OptionPicker';
import { JalaliDateField } from '../components/JalaliDateField';
import { IconAlertTriangle, IconCalendarCheck, IconCheck, IconChevronDown, IconEye, IconEyeOff, IconLock, IconPlus, IconUser } from '../components/Icons';
import { useFeedback } from '../context/FeedbackContext';
import { usePeriods } from '../hooks/usePeriods';
import { periodsRepository, todayKeyNow, PeriodRuleError, type YearInfo } from '../storage/periodsRepository';
import { buildingRepository } from '../storage/buildingRepository';
import { Errors } from '../logic/errors';
import { toPersianDigits } from '../logic/formatting';
import { todayJalali, parseJalaliKey } from '../logic/jalali';
import { unitLabel } from '../logic/building';
import {
  activePeriod, defaultNewManagerDates, effectiveEnd, hasOpenEnd, isPeriodActive, isPeriodClosed, keyToSlash,
  managerDisplayName, yearRangeLines, type MgmtPeriod,
} from '../logic/periods';
import type { BuildingSettings } from '../models/types';

interface Props {
  tab?: 'years' | 'manager';
  onTab: (t: 'years' | 'manager') => void;
  onBack: () => void;
  /** باز کردن مستقیم فرم «مدیر جدید» */
  openNewManager?: boolean;
}

const fa = toPersianDigits;

export function PeriodsScreen({ tab = 'years', onTab, onBack, openNewManager = false }: Props) {
  const [form, setForm] = useState<{ edit: MgmtPeriod | null } | null>(openNewManager ? { edit: null } : null);
  useEffect(() => {
    if (openNewManager) setForm({ edit: null });
  }, [openNewManager]);
  if (form) return <ManagerForm edit={form.edit} onDone={() => setForm(null)} />;
  return (
    <>
      <AppHeader title="دوره‌ها" onBack={onBack} />
      <main className="screen screen--periods">
        <div className="seg" role="tablist" aria-label="دوره‌ها">
          <button type="button" role="tab" aria-selected={tab === 'years'} className={'seg__btn' + (tab === 'years' ? ' is-active' : '')} onClick={() => onTab('years')}>سال‌ها</button>
          <button type="button" role="tab" aria-selected={tab === 'manager'} className={'seg__btn' + (tab === 'manager' ? ' is-active' : '')} onClick={() => onTab('manager')}>مدیر ساختمان</button>
        </div>
        {tab === 'years' ? <YearsTab /> : <ManagerTab onNew={() => setForm({ edit: null })} onEdit={(p) => setForm({ edit: p })} />}
      </main>
    </>
  );
}

/* ─── سال‌ها ─── */

function YearsTab() {
  const { state } = usePeriods();
  const { toast, showErrors } = useFeedback();
  const [hiddenOpen, setHiddenOpen] = useState(false);
  if (!state) return null;
  const current = state.currentYear;
  const shown = state.years.filter((y) => !y.hidden);
  const hidden = state.years.filter((y) => y.hidden);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); } catch (e) {
      showErrors(e instanceof PeriodRuleError ? Errors.backupInvalid(e.message) : Errors.storageFailed());
    }
  };
  const toggle = (y: YearInfo) => void run(
    () => periodsRepository.setYearHidden(y.year, !y.hidden),
    y.hidden ? `سال ${fa(y.year)} دوباره نمایان شد.` : `سال ${fa(y.year)} پنهان شد.`,
  );

  return (
    <section className="periods">
      <div className="period-info">
        <IconCalendarCheck size={22} />
        <div>
          <strong>سال جاری: {fa(current)}</strong>
          <p>سال‌ها خودکار ساخته می‌شوند. هر سال از ۱ فروردین تا آخر اسفند است و سال تازه، اول فروردین خودش اضافه و انتخاب می‌شود.</p>
        </div>
      </div>
      <p className="card__hint">سالی که لازم ندارید را پنهان کنید تا در فیلترهای «سوابق» و «گزارش‌ها» نیاید. قبض‌هایش پاک نمی‌شود و هر وقت بخواهید دوباره نمایانش می‌کنید.</p>
      <ul className="period-list">
        {shown.map((y) => <YearCard key={y.year} y={y} current={current} onToggle={toggle} />)}
      </ul>
      {hidden.length > 0 && (
        <div className={'hidden-years' + (hiddenOpen ? ' is-open' : '')}>
          <button type="button" className="hidden-years__head" aria-expanded={hiddenOpen} onClick={() => setHiddenOpen((v) => !v)}>
            <IconEyeOff size={20} />
            <strong>سال‌های پنهان</strong>
            <span className="hidden-years__count">{fa(hidden.length)} سال</span>
            <IconChevronDown size={20} className="hidden-years__chev" />
          </button>
          {hiddenOpen && (
            <ul className="period-list hidden-years__list">
              {hidden.map((y) => <YearCard key={y.year} y={y} current={current} onToggle={toggle} />)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function YearCard({ y, current, onToggle }: { y: YearInfo; current: number; onToggle: (y: YearInfo) => void }) {
  const lines = yearRangeLines(y.year);
  const chip = y.year === current ? <span className="p-chip is-default">امسال</span>
    : y.year > current ? <span className="p-chip is-open">سال بعد</span>
      : <span className="p-chip">تمام‌شده</span>;
  return (
    <li className={'period-card year-card' + (y.isCurrent ? ' is-current' : '') + (y.hidden ? ' is-hidden' : '')}>
      <div className="period-card__body">
        <div className="period-card__title">
          <strong className="num">{fa(y.year)}</strong>
          {chip}
          {y.hidden && <span className="p-chip is-hidden">پنهان</span>}
        </div>
        <p className="period-card__line">{y.billCount > 0 ? `${fa(y.billCount)} قبض` : 'هنوز قبضی ندارد'}</p>
        <p className="period-card__line">{lines.start}</p>
        <p className="period-card__line">{lines.end}</p>
      </div>
      {y.canHide ? (
        <button
          type="button"
          className={'year-eye' + (y.hidden ? ' is-show' : '')}
          aria-label={y.hidden ? `نمایش سال ${fa(y.year)}` : `پنهان کردن سال ${fa(y.year)}`}
          onClick={() => onToggle(y)}
        >
          {y.hidden ? <IconEye size={20} /> : <IconEyeOff size={20} />}
          <span>{y.hidden ? 'نمایش' : 'پنهان کن'}</span>
        </button>
      ) : (
        <span className="year-eye is-fixed" aria-label="همیشه نمایان">
          <IconEye size={20} />
          <span>همیشه<br />نمایان</span>
        </span>
      )}
    </li>
  );
}

/* ─── مدیر ساختمان ─── */

function periodRange(p: MgmtPeriod): string {
  const start = `از ${keyToSlash(p.startDate)}`;
  const end = effectiveEnd(p);
  return end ? `${keyToSlash(p.startDate)} تا ${keyToSlash(end)}` : `${start} · بدون تاریخ پایان`;
}

function ManagerTab({ onNew, onEdit }: { onNew: () => void; onEdit: (p: MgmtPeriod) => void }) {
  const { state, show } = usePeriods();
  const { toast, showErrors, confirmDanger } = useFeedback();
  if (!state) return null;
  const today = todayKeyNow();
  const active = activePeriod(state.periods, today);
  const list = state.periods.filter((p) => show.managers || !p.hidden);
  const hiddenCount = state.periods.filter((p) => p.hidden).length;

  const run = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); toast(ok); } catch (e) {
      showErrors(e instanceof PeriodRuleError ? Errors.backupInvalid(e.message) : Errors.storageFailed());
    }
  };
  const close = async (p: MgmtPeriod) => {
    if (!(await confirmDanger({
      title: 'بستن دوره',
      text: `دورهٔ «${managerDisplayName(p)}» امروز بسته می‌شود و قبض‌هایش دیگر قابل ویرایش، حذف یا تغییر وضعیت نیستند. پرداخت واحدها همچنان ثبت می‌شود.\nبستن دوره برگشت ندارد.`,
      confirmLabel: 'بستن دوره',
    }))) return;
    await run(() => periodsRepository.closeManager(p.id), 'دوره بسته شد.');
  };

  return (
    <section className="periods">
      <div className="period-switch period-switch--top">
        <div>
          <strong>مدیر ساختمان در این ساختمان</strong>
          <p>{state.mgmtEnabled ? 'روشن: هر قبض تازه به مدیر فعال وصل می‌شود.' : 'خاموش: قبض‌ها بدون مدیر ثبت می‌شوند و دوره‌ای لازم نیست.'}</p>
        </div>
        <Switch id="mgmt-enabled" label="مدیر ساختمان در این ساختمان" checked={state.mgmtEnabled} onChange={(v) => void run(() => periodsRepository.setMgmtEnabled(v), v ? 'مدیر ساختمان روشن شد.' : 'مدیر ساختمان خاموش شد.')} />
      </div>
      {state.mgmtEnabled && (
        <>
        <div className={'period-info' + (active ? '' : ' is-warn')}>
          {active ? <IconUser size={22} /> : <IconAlertTriangle size={22} />}
          <div>
            <strong>{active ? `مدیر فعال: ${managerDisplayName(active)}${active.managerUnit != null && active.managerLabel.trim() ? ` (واحد ${fa(active.managerUnit)})` : ''}` : 'مدیر فعالی نیست'}</strong>
            <p>{active ? 'قبض‌های تازه خودکار به نام این مدیر ثبت می‌شوند.' : 'تا مدیر جدید ثبت نشود، قبض تازه ثبت نمی‌شود.'}</p>
          </div>
        </div>
      {list.length === 0 && <p className="card__hint">هنوز مدیری ثبت نشده است.</p>}
      <ul className="period-list">
        {list.map((p) => {
          const closed = isPeriodClosed(p, today);
          const isActive = active?.id === p.id;
          const notStarted = !closed && !isPeriodActive(p, today);
          const count = state.periodBillCounts.get(p.id) ?? 0;
          return (
            <li key={p.id} className={'period-card' + (isActive ? ' is-default' : '') + (closed ? ' is-closed' : '') + (p.hidden ? ' is-hidden' : '')}>
              <span className={'period-tick is-static' + (isActive ? ' is-on' : '')} aria-hidden="true">{isActive && <IconCheck size={15} strokeWidth={3} />}</span>
              <div className="period-card__body">
                <div className="period-card__title">
                  <strong>{managerDisplayName(p)}</strong>
                  {closed ? <span className="p-chip is-closed"><IconLock size={11} /> بسته</span> : notStarted ? <span className="p-chip">شروع نشده</span> : <span className="p-chip is-open">باز</span>}
                  {isActive && <span className="p-chip is-default">فعال</span>}
                  {p.hidden && <span className="p-chip is-hidden"><IconEyeOff size={11} /> پنهان</span>}
                </div>
                {p.managerUnit != null && p.managerLabel.trim() && <p className="period-card__line">واحد {fa(p.managerUnit)}</p>}
                <p className="period-card__line">{periodRange(p)}</p>
                <p className="period-card__line">{count > 0 ? `${fa(count)} قبض` : 'قبضی به این دوره وصل نیست'}</p>
                {!closed && hasOpenEnd(p) && <p className="period-card__warn"><IconAlertTriangle size={14} /> بدون تاریخ پایان؛ خودبه‌خود بسته نمی‌شود.</p>}
                <div className="period-card__actions">
                  {!closed && <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(p)}>ویرایش</button>}
                  {!closed && <button type="button" className="btn btn--ghost btn--sm" onClick={() => void close(p)}>بستن دوره</button>}
                  {closed && (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => void run(() => periodsRepository.setManagerHidden(p.id, !p.hidden), p.hidden ? 'دوره دوباره نمایش داده می‌شود.' : 'دوره پنهان شد.')}>
                      {p.hidden ? 'نمایش در فهرست‌ها' : 'پنهان کردن'}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn btn--primary btn--block" onClick={onNew}><IconPlus size={20} /> مدیر جدید</button>
      <div className="period-switch">
        <div>
          <strong>نمایش دوره‌های پنهان</strong>
          <p>دورهٔ پنهان فقط از فهرست کنار می‌رود؛ تاریخچهٔ مدیران پاک نمی‌شود.{hiddenCount > 0 ? ` (${fa(hiddenCount)} دورهٔ پنهان)` : ''}</p>
        </div>
        <Switch id="show-hidden-managers" label="نمایش دوره‌های پنهان" checked={show.managers} onChange={(v) => void periodsRepository.setShowHidden({ managers: v })} />
      </div>
        </>
      )}
    </section>
  );
}

/* ─── فرم مدیر جدید / ویرایش ─── */

function ManagerForm({ edit, onDone }: { edit: MgmtPeriod | null; onDone: () => void }) {
  const { toast, showErrors, confirmDanger } = useFeedback();
  const today = todayJalali();
  const defaults = defaultNewManagerDates(todayKeyNow());
  const [building, setBuilding] = useState<BuildingSettings | null>(null);
  const [unit, setUnit] = useState<number>(edit?.managerUnit ?? 0);
  const [alias, setAlias] = useState(edit?.managerLabel ?? '');
  const [start, setStart] = useState<string | null>(edit?.startDate ?? defaults.startDate);
  const [noEnd, setNoEnd] = useState(edit ? hasOpenEnd(edit) : false);
  const [end, setEnd] = useState<string | null>(edit ? (hasOpenEnd(edit) ? null : edit.endDate) : defaults.endDate);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void buildingRepository.get().then(setBuilding).catch(() => undefined); }, []);
  const units = building?.units ?? [];
  const years = Array.from({ length: 8 }, (_, i) => today.year - 3 + i);
  const startD = parseJalaliKey(start) ?? today;

  const save = async () => {
    const name = alias.trim();
    if (!name) { showErrors(Errors.backupInvalid('نام مدیر را بنویسید.')); return; }
    const managerUnit = unit > 0 ? unit : null;
    const startDate = start || defaults.startDate;
    const endDate = noEnd ? null : (end || defaults.endDate);
    if (!noEnd && !endDate) { showErrors(Errors.backupInvalid('تاریخ پایان را انتخاب کنید یا «بدون تاریخ پایان» را روشن کنید.')); return; }
    setBusy(true);
    try {
      if (edit) {
        await periodsRepository.editManager(edit.id, { managerUnit, alias: name, endDate });
        toast('دوره ویرایش شد.');
        onDone();
        return;
      }
      const plan = await periodsRepository.planNewManager({ managerUnit, startDate, endDate });
      if (!plan.ok) { showErrors(Errors.backupInvalid(plan.error)); return; }
      if (plan.closes.length > 0) {
        const text = plan.closes.map((c) => `دورهٔ «${c.name}» در ${keyToSlash(c.endDate)} (روز قبل از شروع مدیر جدید) بسته می‌شود.`).join('\n')
          + '\nبعد از آن، قبض‌های آن دوره قفل می‌شوند. این کار برگشت ندارد.';
        if (!(await confirmDanger({ title: 'تعویض مدیر', text, confirmLabel: 'ثبت مدیر جدید', tone: 'warning' }))) return;
      }
      await periodsRepository.addManager({ managerUnit, alias: name, startDate, endDate });
      toast('مدیر جدید ثبت شد.');
      onDone();
    } catch (e) {
      showErrors(e instanceof PeriodRuleError ? Errors.backupInvalid(e.message) : Errors.storageFailed());
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppHeader title={edit ? 'ویرایش مدیر' : 'مدیر جدید'} onBack={onDone} />
      <main className="screen screen--periods">
        <div className="card manager-form">
          <div className="field">
            <OptionPicker
              id="mgr-unit"
              label="مدیر (از واحدها)"
              value={unit}
              options={[{ value: 0, label: 'انتخاب کنید' }, ...units.map((u, i) => ({ value: i + 1, label: unitLabel(i + 1, u.alias) }))]}
              onChange={(v) => setUnit(v as number)}
            />
          </div>
          <label className="field">
            <span className="field__label">نام مدیر</span>
            <input className="input" value={alias} maxLength={80} onChange={(e) => setAlias(e.target.value)} placeholder="مثلاً آقای احمدی" required />
          </label>
          {edit ? (
            <div className="field">
              <span className="field__label">شروع دوره</span>
              <p className="period-card__line">{keyToSlash(edit.startDate)} (تاریخ شروع تغییر نمی‌کند)</p>
            </div>
          ) : (
            <JalaliDateField id="mgr-start" label="شروع دوره" value={start} onChange={setStart} defaultDate={today} years={years} clearable={false} />
          )}
          <JalaliDateField
            id="mgr-end"
            label="پایان دوره"
            value={end}
            onChange={setEnd}
            defaultDate={startD}
            years={years}
            disabled={noEnd}
            clearable={false}
            addLabel="تعیین تاریخ پایان"
          />
          <div className="period-switch">
            <div>
              <strong>بدون تاریخ پایان</strong>
              <p>تا وقتی خودتان ببندید یا مدیر بعدی را ثبت کنید باز می‌ماند.</p>
            </div>
            <Switch id="mgr-no-end" label="بدون تاریخ پایان" checked={noEnd} onChange={(v) => { setNoEnd(v); if (!v && !end) setEnd(defaults.endDate); }} />
          </div>
          {noEnd && (
            <p className="period-note">توجه: دورهٔ بدون پایان خودبه‌خود بسته نمی‌شود. تا بسته نشود، قبض‌های این مدیر قابل ویرایش و حذف می‌مانند. وقتی مدیر بعدی را ثبت کنید، این دوره روز قبل از شروع او بسته می‌شود.</p>
          )}
          <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={() => void save()}>ذخیره</button>
        </div>
      </main>
    </>
  );
}
