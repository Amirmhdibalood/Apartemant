import { Dialog } from './Dialog';
import { IconRestore } from './Icons';
import type { BackupSummary } from '../logic/backup';
import { toPersianDigits } from '../logic/formatting';

interface Props {
  summary: BackupSummary | null;
  /** تعداد قبض‌های فعلی گوشی که جایگزین می‌شوند */
  currentBills: number;
  title?: string;
  confirmLabel?: string;
  onResult: (ok: boolean) => void;
}

/** تأیید بازیابی: خلاصه محتوای فایل پشتیبان + هشدار جایگزینی اطلاعات فعلی */
export function RestoreConfirmDialog({ summary, currentBills, title = 'بازیابی از فایل پشتیبان', confirmLabel = 'بازیابی و جایگزینی', onResult }: Props) {
  const years = summary?.years ?? [];
  return (
    <Dialog open={!!summary} onClose={() => onResult(false)} labelledBy="restore-title" variant="warning">
      {summary && (
        <>
          <div className="dialog__icon dialog__icon--restore"><IconRestore size={30} /></div>
          <h2 id="restore-title" className="dialog__title">{title}</h2>
          <dl className="backup-summary">
            <div><dt>تاریخ تهیه</dt><dd>{summary.createdAtFa}</dd></div>
            <div><dt>تعداد قبض‌ها</dt><dd>{toPersianDigits(summary.bills)} قبض ({toPersianDigits(summary.settledBills)} تسویه‌شده)</dd></div>
            <div><dt>تعداد واحدها</dt><dd>{toPersianDigits(summary.units)}</dd></div>
            {years.length > 0 && <div><dt>سال‌ها</dt><dd>{years.map((y) => toPersianDigits(y)).join('، ')}</dd></div>}
            {summary.appVersion && <div><dt>نسخه برنامه</dt><dd>{toPersianDigits(summary.appVersion)}</dd></div>}
          </dl>
          {currentBills > 0 ? (
            <p className="backup-warning">
              <strong>توجه:</strong> همه اطلاعات فعلی این گوشی ({toPersianDigits(currentBills)} قبض و تنظیمات) <strong>حذف و با اطلاعات این فایل جایگزین</strong> می‌شود.
              قبل از جایگزینی، یک نسخه ایمنی خودکار از اطلاعات فعلی نگه داشته می‌شود.
            </p>
          ) : (
            <p className="backup-warning backup-warning--info">
              در حال حاضر قبضی در این گوشی ثبت نشده است. قبض‌ها و تنظیمات این فایل جایگزین تنظیمات فعلی می‌شوند.
            </p>
          )}
          <div className="dialog__actions dialog__actions--two">
            <button type="button" className="btn btn--danger" onClick={() => onResult(true)}>{confirmLabel}</button>
            <button type="button" className="btn btn--muted" onClick={() => onResult(false)}>انصراف</button>
          </div>
        </>
      )}
    </Dialog>
  );
}
