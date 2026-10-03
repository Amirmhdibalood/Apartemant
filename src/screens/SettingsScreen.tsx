import { AppHeader } from '../components/AppHeader';
import { Switch } from '../components/Switch';
import { IconAlertTriangle } from '../components/Icons';
import { useSettings } from '../context/SettingsContext';
import { useFeedback } from '../context/FeedbackContext';
import { YearPicker } from '../components/YearPicker';
import { BackupSection } from '../components/BackupSection';
import { BuildingSection } from '../components/BuildingSection';
import { useState } from 'react';
import { selectableYears, toggleYear } from '../logic/years';
import { APP_VERSION_FA, DEVELOPER_EMAIL, DEVELOPER_NAME } from '../appVersion';
import { Errors } from '../logic/errors';
import { useNotif } from '../context/NotifContext';
import { NOTIF_MODES } from '../logic/notifMode';
import { useAreaMode } from '../context/AreaModeContext';
import { AREA_MODES } from '../logic/areaMode';
import { useEntryPrefs } from '../context/EntryPrefsContext';
import { ALL_SPLIT_METHODS } from '../logic/entryPrefs';
import { EXPENSE_TYPES, EXPENSE_TYPE_ORDER, SPLIT_METHOD_LABELS } from '../models/constants';
import { ExpenseIcon } from '../components/ExpenseIcon';
import { useIconPrefs } from '../context/IconPrefsContext';
import { AREA_ICONS, UNIT_ICONS } from '../logic/iconPrefs';
import { AreaIcon, UnitIcon } from '../components/PrefIcons';

/** ۱۵. تنظیمات */
export function SettingsScreen({ onBack, canGoBack, onHelp }: { onBack: () => void; canGoBack: boolean; onHelp?: () => void }) {
  const { settings, updateSettings } = useSettings();
  const { showErrors, toast } = useFeedback();
  const { mode, setMode } = useNotif();
  const { areaMode, setAreaMode } = useAreaMode();
  const { unitIcon, areaIcon, setUnitIcon, setAreaIcon } = useIconPrefs();
  const { prefs, setTypeOn, setMethodOn } = useEntryPrefs();
  const years = selectableYears();
  const [restoreKey, setRestoreKey] = useState(0);

  const onYear = (y: number) => {
    const next = toggleYear(settings.activeYears, y);
    if (next === null) {
      showErrors(Errors.minOneYear());
      return;
    }
    updateSettings((s) => ({ ...s, activeYears: next }));
  };

  return (
    <>
      <AppHeader title="تنظیمات" onBack={canGoBack ? onBack : undefined} onHelp={onHelp} />
      <main className="screen screen--settings">
        <section className="card settings-card">
          <h2 className="card__title">سال‌ها</h2>
          <p className="card__hint">
            فهرست را باز کنید و سال‌های مورد نیاز را فعال یا غیرفعال کنید. فقط سال‌های فعال در کشوی سال صفحه «ثبت قبض جدید» و «سوابق» نمایش داده می‌شوند. حداقل یک سال باید فعال بماند.
          </p>
          <YearPicker years={years} active={settings.activeYears} onToggle={onYear} />
        </section>

        <BuildingSection reloadKey={restoreKey} />

        <section className="card settings-card entry-prefs" aria-labelledby="entry-prefs-title">
          <h2 className="card__title" id="entry-prefs-title">انواع قبض و روش‌های محاسبه</h2>
          <p className="card__hint">
            نوع خاموش از فرم ثبت، سوابق، فیلترها، گزارش‌ها و جمع‌ها کنار می‌رود و با روشن شدن دوباره برمی‌گردد (داده پاک نمی‌شود).
            روش خاموش در انتخاب نحوه تقسیم نمی‌آید. از هر گروه دست‌کم یکی باید روشن بماند.
          </p>
          <h3 className="settings-sub">انواع قبض در برنامه</h3>
          {EXPENSE_TYPE_ORDER.map((t) => {
            const on = prefs.types.includes(t);
            return (
              <div className="setting-row entry-prefs__row" key={t}>
                <label htmlFor={`sw-type-${t}`} className="setting-row__text entry-prefs__label">
                  <ExpenseIcon type={t} size={26} />
                  <span className="setting-row__label">{EXPENSE_TYPES[t].label}</span>
                </label>
                <Switch id={`sw-type-${t}`} label={`نوع قبض ${EXPENSE_TYPES[t].label}`} checked={on} disabled={on && prefs.types.length === 1} onChange={(v) => setTypeOn(t, v)} />
              </div>
            );
          })}
          <h3 className="settings-sub">روش‌های محاسبه در ثبت قبض</h3>
          {ALL_SPLIT_METHODS.map((m) => {
            const on = prefs.methods.includes(m);
            return (
              <div className="setting-row entry-prefs__row" key={m}>
                <label htmlFor={`sw-method-${m}`} className="setting-row__text entry-prefs__label">
                  <span className="setting-row__label">{SPLIT_METHOD_LABELS[m]}</span>
                </label>
                <Switch id={`sw-method-${m}`} label={`روش ${SPLIT_METHOD_LABELS[m]}`} checked={on} disabled={on && prefs.methods.length === 1} onChange={(v) => setMethodOn(m, v)} />
              </div>
            );
          })}
          {prefs.methods.length === 1 && <p className="card__hint entry-prefs__note">فقط یک روش روشن است؛ انتخابگر نحوه تقسیم در فرم ثبت قبض پنهان و همین روش استفاده می‌شود.</p>}
        </section>

        <section className="card settings-card appearance-card" aria-labelledby="appearance-title">
          <h2 className="card__title" id="appearance-title">تنظیمات ظاهری</h2>
          <p className="card__hint">فقط شکل نمایش را عوض می‌کند؛ روی قبض‌ها و محاسبه‌ها اثری ندارد و در فایل پشتیبان نیست.</p>
          <div className="settings-group" role="group" aria-labelledby="area-mode-title">
            <h3 className="settings-sub" id="area-mode-title">نحوه نمایش متراژ</h3>
            <p className="card__hint">شکل ورودی و نمایش متراژ واحدها در «ساختمان»، فرم قبض، نتیجه و جزئیات قبض (برای تقسیم «بر اساس متراژ»).</p>
            <div className="seg" role="radiogroup" aria-label="نحوه نمایش متراژ">
              {AREA_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={areaMode === m.id}
                  className={'seg__btn' + (areaMode === m.id ? ' is-active' : '')}
                  onClick={() => setAreaMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="card__hint notif-mode-hint">{AREA_MODES.find((m) => m.id === areaMode)?.hint}</p>
          </div>

          <div className="settings-group" role="group" aria-labelledby="unit-icon-title">
            <h3 className="settings-sub" id="unit-icon-title">نماد واحد</h3>
            <p className="card__hint">نمادی که کنار هر واحد در فرم قبض، نتیجه و گزارش بدهکاران دیده می‌شود. آدمک فقط برای «تعداد نفرات» می‌ماند.</p>
            <div className="icon-grid" role="radiogroup" aria-label="نماد واحد">
              {UNIT_ICONS.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={unitIcon === o.id}
                  aria-label={o.label}
                  className={'icon-opt' + (unitIcon === o.id ? ' is-active' : '')}
                  onClick={() => setUnitIcon(o.id)}
                >
                  <span className="unit-avatar icon-opt__glyph"><UnitIcon id={o.id} number={i + 1} size={18} /></span>
                  <span className="icon-opt__label">{o.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-group" role="group" aria-labelledby="area-icon-title">
            <h3 className="settings-sub" id="area-icon-title">نماد متراژ</h3>
            <p className="card__hint">نشانی که در حالت «بر اساس متراژ» کنار سرستون متراژ (فرم قبض و تنظیمات ← ساختمان) می‌آید.</p>
            <div className="icon-grid" role="radiogroup" aria-label="نماد متراژ">
              {AREA_ICONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={areaIcon === o.id}
                  aria-label={o.label}
                  className={'icon-opt' + (areaIcon === o.id ? ' is-active' : '')}
                  onClick={() => setAreaIcon(o.id)}
                >
                  <span className="icon-opt__glyph icon-opt__glyph--area">{o.id === 'none' ? <span className="icon-opt__none">—</span> : <AreaIcon id={o.id} size={20} />}</span>
                  <span className="icon-opt__label">{o.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="settings-group" role="group" aria-labelledby="notif-mode-title">
            <h3 className="settings-sub" id="notif-mode-title">نحوه نمایش اعلان‌ها</h3>
            <p className="card__hint">با زدن زنگولهٔ بالای صفحه، اعلان‌های مهلت پرداخت (از ۲ روز قبل) به این شکل باز می‌شوند.</p>
            <div className="seg" role="radiogroup" aria-label="نحوه نمایش اعلان‌ها">
              {NOTIF_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  className={'seg__btn' + (mode === m.id ? ' is-active' : '')}
                  onClick={() => setMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="card__hint notif-mode-hint">{NOTIF_MODES.find((m) => m.id === mode)?.hint}</p>
          </div>

        </section>

        <section className="card settings-card">
          <h2 className="card__title">هشدارها</h2>
          <div className="setting-row">
            <label htmlFor="sw-save" className="setting-row__text">
              <span className="setting-row__label">نمایش هشدار قبل از ذخیره</span>
              <span className="setting-row__hint">پیام «توجه» پیش از ذخیره هر قبض نمایش داده شود.</span>
            </label>
            <Switch
              id="sw-save"
              label="نمایش هشدار قبل از ذخیره"
              checked={settings.showSaveWarning}
              onChange={(v) => updateSettings((s) => ({ ...s, showSaveWarning: v }))}
            />
          </div>
          {settings.dismissedWarnings.length > 0 && (
            <button
              type="button"
              className="btn btn--soft btn--block btn--sm"
              onClick={() => {
                updateSettings((s) => ({ ...s, dismissedWarnings: [] }));
                toast('هشدارهای پنهان‌شده دوباره نمایش داده می‌شوند.');
              }}
            >
              <IconAlertTriangle size={18} />
              <span>نمایش دوباره سایر هشدارهای پنهان‌شده</span>
            </button>
          )}
        </section>

        <BackupSection onRestored={() => setRestoreKey((k) => k + 1)} />
        <p className="app-version">آپارتمانت — {APP_VERSION_FA} — کاملاً آفلاین</p>
        <p className="app-credit">
          سازنده: <span dir="ltr">{DEVELOPER_NAME}</span>
          <br />
          <a dir="ltr" href={`mailto:${DEVELOPER_EMAIL}`}>{DEVELOPER_EMAIL}</a>
        </p>
      </main>
    </>
  );
}
