import { AppHeader } from '../components/AppHeader';
import { Switch } from '../components/Switch';
import { IconAlertTriangle } from '../components/Icons';
import { useSettings } from '../context/SettingsContext';
import { useFeedback } from '../context/FeedbackContext';
import { FIRST_YEAR, YEARS_AHEAD } from '../models/constants';
import { currentJalali } from '../logic/date';
import { toggleYear, yearRange } from '../logic/years';
import { Errors } from '../logic/errors';

/** ۱۵. تنظیمات */
export function SettingsScreen({ onBack, canGoBack }: { onBack: () => void; canGoBack: boolean }) {
  const { settings, updateSettings } = useSettings();
  const { showErrors, toast } = useFeedback();
  const years = yearRange(FIRST_YEAR, Math.max(currentJalali().year, FIRST_YEAR) + YEARS_AHEAD);

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
      <AppHeader title="تنظیمات" onBack={canGoBack ? onBack : undefined} />
      <main className="screen screen--settings">
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

        <section className="card settings-card">
          <h2 className="card__title">سال‌ها</h2>
          <p className="card__hint">
            روی هر سال بزنید تا فعال یا غیرفعال شود. فقط سال‌های فعال (آبی) در کشوی سال صفحه «ثبت قبض جدید» و «سوابق» نمایش داده می‌شوند.
          </p>
          <div className="chips">
            {years.map((y) => {
              const active = settings.activeYears.includes(y);
              return (
                <button
                  key={y}
                  type="button"
                  className={'chip' + (active ? ' is-active' : '')}
                  aria-pressed={active}
                  onClick={() => onYear(y)}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </section>
        <p className="app-version">شارژ ساختمان — نسخه 1.0.0 — کاملاً آفلاین</p>
      </main>
    </>
  );
}
