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

/** ۱۵. تنظیمات */
export function SettingsScreen({ onBack, canGoBack, onHelp }: { onBack: () => void; canGoBack: boolean; onHelp?: () => void }) {
  const { settings, updateSettings } = useSettings();
  const { showErrors, toast } = useFeedback();
  const { mode, setMode } = useNotif();
  const { areaMode, setAreaMode } = useAreaMode();
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
        <BuildingSection reloadKey={restoreKey} />

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

        <section className="card settings-card" aria-labelledby="area-mode-title">
          <h2 className="card__title" id="area-mode-title">نحوه نمایش متراژ</h2>
          <p className="card__hint">شکل ورودی و نمایش متراژ واحدها در «ساختمان»، فرم قبض، نتیجه و جزئیات قبض (برای تقسیم «بر اساس متراژ»). فقط ظاهر را عوض می‌کند و در فایل پشتیبان نیست.</p>
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
        </section>

        <section className="card settings-card" aria-labelledby="notif-mode-title">
          <h2 className="card__title" id="notif-mode-title">نحوه نمایش اعلان‌ها</h2>
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
        </section>

        <section className="card settings-card">
          <h2 className="card__title">سال‌ها</h2>
          <p className="card__hint">
            فهرست را باز کنید و سال‌های مورد نیاز را فعال یا غیرفعال کنید. فقط سال‌های فعال در کشوی سال صفحه «ثبت قبض جدید» و «سوابق» نمایش داده می‌شوند. حداقل یک سال باید فعال بماند.
          </p>
          <YearPicker years={years} active={settings.activeYears} onToggle={onYear} />
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
