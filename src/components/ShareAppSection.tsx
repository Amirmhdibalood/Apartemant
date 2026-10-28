import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { STORE_LINKS, visibleStoreLinks } from '../config/storeLinks';
import { useFeedback } from '../context/FeedbackContext';
import { Errors } from '../logic/errors';
import { copyText } from '../services/clipboard';

export function ShareAppSection() {
  const { toast, showErrors } = useFeedback();
  const links = visibleStoreLinks(STORE_LINKS);

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
      {links.length === 0 ? (
        <p className="card__hint">
          لینک فروشگاه‌ها هنوز تنظیم نشده است. پس از انتشار در مایکت یا بازار، آدرس‌ها در تنظیمات توسعه‌دهنده (`src/config/storeLinks.ts`) پر می‌شوند و اینجا دکمهٔ اشتراک می‌آید.
        </p>
      ) : (
        <ul className="share-app-list">
          {links.map((l) => (
            <li key={l.id}>
              <button type="button" className="btn btn--primary" onClick={() => void shareUrl(l.url, l.label)}>
                اشتراک لینک {l.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
