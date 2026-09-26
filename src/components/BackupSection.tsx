import { useCallback, useEffect, useRef, useState } from 'react';
import { IconRestore, IconShare, IconShield } from './Icons';
import { RestoreConfirmDialog } from './RestoreConfirmDialog';
import { useSettings } from '../context/SettingsContext';
import { useFeedback } from '../context/FeedbackContext';
import { Errors } from '../logic/errors';
import { toPersianDigits } from '../logic/formatting';
import { formatJalaliDateTimeFa } from '../logic/date';
import {
  MAX_BACKUP_BYTES,
  BackupErrors,
  backupFileName,
  createBackup,
  parseBackup,
  serializeBackup,
  summarizeBackup,
  type BackupFile,
  type BackupSummary,
} from '../logic/backup';
import { backupRepository } from '../storage/backupRepository';
import { exportBackupFile, readPickedFile } from '../services/backupFile';
import { APP_VERSION } from '../appVersion';

/** انواع فایل قابل انتخاب (فایل‌های دریافتی از تلگرام گاهی نوع octet-stream دارند) */
const ACCEPT = '.json,application/json,text/plain,application/octet-stream';

interface Pending {
  backup: BackupFile;
  summary: BackupSummary;
  kind: 'file' | 'undo';
}

/** بخش «پشتیبان‌گیری و بازیابی» در تنظیمات */
export function BackupSection() {
  const { reloadSettings } = useSettings();
  const { showErrors, toast } = useFeedback();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [currentBills, setCurrentBills] = useState(0);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [safety, setSafety] = useState<BackupFile | null>(null);

  const refresh = useCallback(async () => {
    const [data, last, safe] = await Promise.all([
      backupRepository.collect(),
      backupRepository.getLastBackupAt(),
      backupRepository.getSafetyBackup(),
    ]);
    setCurrentBills(data.bills.length);
    setLastBackupAt(last);
    setSafety(safe);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const onBackup = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const now = new Date();
      const backup = createBackup(await backupRepository.collect(), APP_VERSION, now);
      const res = await exportBackupFile(backupFileName(now), serializeBackup(backup));
      if (res.shared || res.savedPath) {
        await backupRepository.setLastBackupAt(now.toISOString());
        await refresh();
      }
      const n = toPersianDigits(backup.data.bills.length);
      if (res.savedPath) toast(`نسخه پشتیبان (${n} قبض) در ${res.savedPath} ذخیره شد.`);
      else if (res.shared) toast(`نسخه پشتیبان (${n} قبض) آماده شد.`);
    } catch {
      showErrors(Errors.backupFailed());
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // تا انتخاب دوباره همان فایل هم کار کند
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      showErrors(Errors.backupInvalid(BackupErrors.tooLarge));
      return;
    }
    let text: string;
    try {
      text = await readPickedFile(file);
    } catch {
      showErrors(Errors.backupInvalid(BackupErrors.notJson));
      return;
    }
    const r = parseBackup(text);
    if (!r.ok) {
      showErrors(Errors.backupInvalid(r.error));
      return;
    }
    await refresh();
    setPending({ backup: r.backup, summary: r.summary, kind: 'file' });
  };

  const onUndo = async () => {
    if (!safety) return;
    await refresh();
    setPending({ backup: safety, summary: summarizeBackup(safety), kind: 'undo' });
  };

  const onConfirm = async (ok: boolean) => {
    const p = pending;
    setPending(null);
    if (!ok || !p) return;
    setBusy(true);
    try {
      // نسخه ایمنی از اطلاعات فعلی قبل از جایگزینی (اگر قبضی در گوشی ثبت شده باشد)
      if ((await backupRepository.collect()).bills.length > 0) await backupRepository.saveSafetyBackup(APP_VERSION);
      await backupRepository.replaceAll(p.backup.data);
      await reloadSettings();
      await refresh();
      toast(
        p.kind === 'undo'
          ? 'اطلاعات قبل از آخرین بازیابی برگردانده شد.'
          : `بازیابی انجام شد: ${toPersianDigits(p.backup.data.bills.length)} قبض بازگردانده شد.`,
      );
    } catch {
      showErrors(Errors.restoreFailed());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card settings-card backup-card">
      <h2 className="card__title">پشتیبان‌گیری و بازیابی</h2>
      <p className="card__hint">
        برای اینکه با خرابی یا تعویض گوشی اطلاعاتتان از بین نرود، هر چند وقت یک‌بار نسخه پشتیبان بگیرید و فایل را در جایی بیرون از گوشی
        (تلگرام، Google Drive، ایمیل یا کامپیوتر) نگه دارید. روی گوشی جدید با «بازیابی از فایل پشتیبان» همه قبض‌ها و تنظیمات برمی‌گردند.
      </p>
      <div className="backup-actions">
        <button type="button" className="btn btn--primary btn--block" onClick={onBackup} disabled={busy}>
          <IconShare size={20} />
          <span>گرفتن نسخه پشتیبان</span>
        </button>
        <button type="button" className="btn btn--soft btn--block" onClick={() => inputRef.current?.click()} disabled={busy}>
          <IconRestore size={20} />
          <span>بازیابی از فایل پشتیبان</span>
        </button>
      </div>
      <input ref={inputRef} type="file" accept={ACCEPT} className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={onPickFile} />
      <p className="backup-meta">
        {lastBackupAt ? `آخرین پشتیبان: ${formatJalaliDateTimeFa(new Date(lastBackupAt))}` : 'هنوز نسخه پشتیبانی گرفته نشده است.'}
      </p>
      {safety && (
        <button type="button" className="backup-undo" onClick={onUndo} disabled={busy}>
          <IconShield size={18} />
          <span className="backup-undo__text">
            <span>برگرداندن اطلاعات قبل از آخرین بازیابی</span>
            <small>
              نسخه ایمنی {formatJalaliDateTimeFa(new Date(safety.createdAt))} — {toPersianDigits(safety.data.bills.length)} قبض
            </small>
          </span>
        </button>
      )}
      <RestoreConfirmDialog
        summary={pending?.summary ?? null}
        currentBills={currentBills}
        title={pending?.kind === 'undo' ? 'برگرداندن اطلاعات قبلی' : 'بازیابی از فایل پشتیبان'}
        confirmLabel={pending?.kind === 'undo' ? 'برگرداندن و جایگزینی' : 'بازیابی و جایگزینی'}
        onResult={onConfirm}
      />
    </section>
  );
}
