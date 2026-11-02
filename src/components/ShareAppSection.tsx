import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { STORE_LINKS, displayStoreLinks } from '../config/storeLinks';
import { useFeedback } from '../context/FeedbackContext';
import { Errors } from '../logic/errors';
import { copyText } from '../services/clipboard';
import { useSettings } from '../context/SettingsContext';
import { Switch } from './Switch';

export function ShareAppSection() {
  const { toast, showErrors } = useFeedback();
  const rows = displayStoreLinks(STORE_LINKS);
  const { settings, updateSettings } = useSettings();

  const shareUrl = async (url: string, title: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({ title: 'آپارتمانت', text: `دانلود آپارتمانت از ${title}`, url, dialogTitle: 'اشتراک‌گذاری لینک' });
      } else {
        await copyText(url);
        toast('لینک کپی شد.');
      }
    } catch {
      try {
        await copyText(url);
        toast('لینک کپی شد.');
      } catch {
        showErrors(Errors.backupInvalid('اشتراک‌گذاری ممکن نشد.'));
      }
    }
  };

  return (
    <div className="share-app-card">
      <p className="card__hint">
        لینک دانلود برنامه را برای همسایه‌ها بفرستید. این بخش برای دعوت عضو به ساختمان نیست؛ فقط نصب خودِ اپ است.
      </p>
      {rows.length === 0 ? (
        <p className="card__hint">لینک فروشگاه‌ها هنوز تنظیم نشده است.</p>
      ) : (
        <ul className="share-app-list">
          {rows.map((l) => {
            const hasUrl = /^https?:\/\//i.test((l.url || '').trim());
            const soon = Boolean(l.comingSoon) && !hasUrl;
            return (
              <li key={l.id} className="share-app-row">
                <div className="share-app-row__text">
                  <div className="share-app-row__name">{l.label}</div>
                  <div className="share-app-row__meta">{soon ? 'هنوز منتشر نشده' : 'لینک آمادهٔ اشتراک'}</div>
                </div>
                {soon ? (
                  <button type="button" className="btn btn--soon" disabled>
                    به‌زودی
                  </button>
                ) : (
                  <button type="button" className="btn btn--primary" onClick={() => void shareUrl(l.url.trim(), l.label)}>
                    اشتراک لینک
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="setting-row share-footer-row">
        <label htmlFor="sw-share-footer" className="setting-row__text">
          <span className="setting-row__label">معرفی برنامه در تصویر قبض</span>
          <span className="setting-row__hint">
            پایین تصویر قبض، نماد کوچک برنامه و «دانلود از مایکت» می‌آید. اگر خاموش باشد، فقط یک خط سادهٔ نام برنامه می‌ماند.
          </span>
        </label>
        <Switch
          id="sw-share-footer"
          label="معرفی برنامه در تصویر قبض"
          checked={settings.shareFooterPromo !== false}
          onChange={(v) => updateSettings((s) => ({ ...s, shareFooterPromo: v }))}
        />
      </div>
    </div>
  );
}
