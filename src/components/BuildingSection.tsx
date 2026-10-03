import { useCallback, useEffect, useRef, useState } from 'react';
import type { BuildingSettings, BuildingUnit } from '../models/types';
import { IconMinus, IconPlus, IconUser } from './Icons';
import { AreaIcon } from './PrefIcons';
import { useIconPrefs } from '../context/IconPrefsContext';
import { Checkbox } from './Checkbox';
import { useFeedback } from '../context/FeedbackContext';
import { buildingRepository } from '../storage/buildingRepository';
import { MAX_ALIAS_LENGTH, MAX_BUILDING_UNITS, resizeBuilding, sanitizeAlias, unitLabel } from '../logic/building';
import { sanitizePersonCount, toPersianDigits } from '../logic/formatting';
import { Errors } from '../logic/errors';
import { confirmUnitReduction } from './confirmUnitReduction';
import { AreaInput } from './AreaInput';
import { useAreaMode } from '../context/AreaModeContext';
import { areaToInput, DEFAULT_AREA, parseArea } from '../logic/area';

interface Row { alias: string; persons: string; vacant: boolean; area: string }

const toRows = (b: BuildingSettings): Row[] => b.units.map((u) => ({ alias: u.alias ?? '', persons: String(u.defaultPersons), vacant: u.vacant === true, area: areaToInput(u.area ?? DEFAULT_AREA) }));
const fromRows = (rows: Row[], prev: BuildingSettings | null): BuildingSettings => ({
  units: rows.map((r, i) => {
    // نفرات خالی یا ۰ (در حال تایپ) = مقدار قبلی ذخیره‌شده، وگرنه ۱
    const typed = /^\d+$/.test(r.persons.trim()) ? Number(r.persons.trim()) : 0;
    const unit: BuildingUnit = { alias: sanitizeAlias(r.alias), defaultPersons: typed >= 1 ? typed : prev?.units[i]?.defaultPersons || 1 };
    if (r.vacant) unit.vacant = true;
    unit.area = parseArea(r.area) ?? DEFAULT_AREA; // خالی/نامعتبر ← پیش‌فرض ۱
    return unit;
  }),
});

/**
 * بخش «ساختمان» در تنظیمات (از نسخه ۱.۶.۰): تعداد واحدها + اسم مستعار و نفرات پیش‌فرض هر واحد.
 * فقط پیش‌فرض قبض‌های جدید است؛ قبض‌های ثبت‌شده عکس لحظه‌ای خودشان را دارند.
 */
export function BuildingSection({ reloadKey = 0 }: { reloadKey?: number }) {
  const { showErrors, confirmDanger } = useFeedback();
  const [rows, setRows] = useState<Row[] | null>(null);
  const saved = useRef<BuildingSettings | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [countText, setCountText] = useState('');
  const { areaMode } = useAreaMode();
  const { areaIcon } = useIconPrefs();

  useEffect(() => {
    let alive = true;
    buildingRepository.get().then((b) => {
      if (!alive) return;
      saved.current = b;
      setRows(toRows(b));
      setCountText(String(b.units.length));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [reloadKey]);

  const persist = useCallback(async (next: Row[]) => {
    try {
      saved.current = await buildingRepository.save(fromRows(next, saved.current));
    } catch {
      showErrors(Errors.storageFailed());
    }
  }, [showErrors]);

  // ذخیره خودکار (با کمی تأخیر هنگام تایپ)
  const update = (next: Row[], immediate = false) => {
    setRows(next);
    window.clearTimeout(timer.current);
    if (immediate) void persist(next);
    else timer.current = window.setTimeout(() => void persist(next), 400);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const setCount = async (target: number) => {
    if (!rows) return;
    const n = Math.max(1, Math.min(MAX_BUILDING_UNITS, Math.floor(target)));
    if (n === rows.length) { setCountText(String(n)); return; }
    if (n < rows.length && !(await confirmUnitReduction(n, confirmDanger))) {
      setCountText(String(rows.length));
      return;
    }
    const resized = resizeBuilding(fromRows(rows, saved.current), n);
    const next = [...rows.slice(0, n), ...toRows(resized).slice(rows.length)];
    setCountText(String(n));
    update(next, true);
  };

  const commitCountText = () => {
    const t = countText.trim();
    if (!/^\d+$/.test(t) || Number(t) < 1) { setCountText(String(rows?.length ?? 1)); return; }
    void setCount(Number(t));
  };

  if (!rows) return <div className="building-card" aria-busy="true" />;

  return (
    <div className="building-card">
      <p className="card__hint">
        واحدهای پیش‌فرض قبض جدید. در فرم قبض هم می‌توانید واحد اضافه/حذف کنید یا نفرات را تغییر دهید (فقط برای همان قبض).
        تغییر این تنظیمات روی قبض‌های ثبت‌شده، گزارش‌ها و بدهی‌ها اثری ندارد.
      </p>

      <div className="setting-row building-count">
        <span className="setting-row__text">
          <span className="setting-row__label">تعداد واحدها</span>
        </span>
        <div className="stepper" role="group" aria-label="تعداد واحدها">
          <button type="button" className="stepper__btn" aria-label="کم کردن واحد" onClick={() => void setCount(rows.length - 1)} disabled={rows.length <= 1}>
            <IconMinus size={18} strokeWidth={3} />
          </button>
          <input
            className="input stepper__input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            dir="ltr"
            maxLength={3}
            aria-label="تعداد واحدها"
            value={countText}
            onChange={(e) => setCountText(sanitizePersonCount(e.target.value))}
            onBlur={commitCountText}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
          <button type="button" className="stepper__btn" aria-label="افزودن واحد" onClick={() => void setCount(rows.length + 1)} disabled={rows.length >= MAX_BUILDING_UNITS}>
            <IconPlus size={18} strokeWidth={3} />
          </button>
        </div>
      </div>

      <div className={'building-units area-' + areaMode}>
        <div className="building-unit building-unit--head">
          <span>واحد</span>
          <span>اسم مستعار (اختیاری)</span>
          <span className="building-unit__persons-h"><IconUser size={13} /> نفرات</span>
          {areaMode === 'column' && <span className="building-unit__persons-h"><AreaIcon id={areaIcon} size={13} /> متراژ</span>}
          <span className="building-unit__vacant-h">خالی</span>
        </div>
        {rows.map((r, i) => (
          <div className="building-unit" key={i}>
            <span className="building-unit__num">
              <span className="num">{i + 1}</span>
            </span>
            <input
              className="input building-unit__alias"
              type="text"
              autoComplete="off"
              maxLength={MAX_ALIAS_LENGTH}
              placeholder={unitLabel(i + 1)}
              aria-label={`اسم مستعار واحد ${toPersianDigits(i + 1)}`}
              value={r.alias}
              onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, alias: e.target.value } : x)))}
              onBlur={() => update(rows, true)}
            />
            <input
              className={'input input--count building-unit__persons' + (r.vacant ? ' is-weight' : '')}
              disabled={r.vacant}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              dir="ltr"
              maxLength={4}
              aria-label={`نفرات پیش‌فرض واحد ${toPersianDigits(i + 1)}`}
              value={r.persons}
              onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, persons: sanitizePersonCount(e.target.value) } : x)))}
              onBlur={() => {
                if (r.persons.trim() === '' || Number(r.persons) < 1) {
                  const restored = rows.map((x, j) => (j === i ? { ...x, persons: String(saved.current?.units[i]?.defaultPersons ?? 1) } : x));
                  update(restored, true);
                } else update(rows, true);
              }}
            />
            {areaMode === 'column' && (
              <AreaInput
                className="building-unit__area"
                value={r.area}
                ariaLabel={`متراژ واحد ${toPersianDigits(i + 1)}`}
                onChange={(v) => update(rows.map((x, j) => (j === i ? { ...x, area: v } : x)))}
                onBlur={(v) => update(rows.map((x, j) => (j === i ? { ...x, area: v } : x)), true)}
              />
            )}
            <span className="building-unit__vacant">
              <Checkbox checked={r.vacant} onChange={(v) => update(rows.map((x, j) => (j === i ? { ...x, vacant: v } : x)), true)} ariaLabel={`واحد ${toPersianDigits(i + 1)} خالی است`} />
            </span>
            {areaMode === 'line' && (
              <span className="building-unit__area-line">
                <label htmlFor={`bu-area-${i}`}>متراژ</label>
                <AreaInput
                  id={`bu-area-${i}`}
                  value={r.area}
                  ariaLabel={`متراژ واحد ${toPersianDigits(i + 1)}`}
                  onChange={(v) => update(rows.map((x, j) => (j === i ? { ...x, area: v } : x)))}
                  onBlur={(v) => update(rows.map((x, j) => (j === i ? { ...x, area: v } : x)), true)}
                />
                <span className="area-unit">مترمربع</span>
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="building-note-small">متراژ (اعشار مجاز مثل ۷۵٫۵؛ پیش‌فرض هر واحد ۱) فقط برای تقسیم «بر اساس متراژ» به‌کار می‌رود و در فرم قبض پیش‌فرض می‌شود؛ ظاهر آن را در «نحوه نمایش متراژ» پایین‌تر انتخاب کنید.</p>
      <p className="building-note-small">واحد «خالی» در قبض‌های جدید از محاسبه کنار گذاشته می‌شود (در هیچ‌کدام از دو روش تقسیم سهمی ندارد و در بدهکاران نمی‌آید)؛ در فرم قبض می‌توانید برای همان قبض تغییرش دهید. نام واحد بدون اسم مستعار: «واحد ۱»، «واحد ۲»، ...</p>
    </div>
  );
}
