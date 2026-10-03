import { describe, expect, it, vi } from 'vitest';
import {
  BACKUP_FAIL_SAVE, BACKUP_FAIL_SHARE, BACKUP_FAIL_TITLE, exportFailureError, failureReason, isShareCancel, performBackupExport,
  type ExportDeps, type ExportResult,
} from '../src/logic/backupExport';

const deps = (over: Partial<ExportDeps> = {}): ExportDeps => ({
  isNative: true,
  download: vi.fn(),
  saveCopy: vi.fn(async () => 'Documents/Apartemant/a.json'),
  writeTemp: vi.fn(async () => 'file:///cache/a.json'),
  share: vi.fn(async () => ({ activityType: 'org.telegram.messenger' })),
  ...over,
});
type Fail = Extract<ExportResult, { ok: false }>;

describe('خروجی پشتیبان: موفقیت فقط وقتی واقعاً مقصدی انتخاب شده', () => {
  it('اشتراک‌گذاری با مقصد انتخاب‌شده ← موفق', async () => {
    const d = deps();
    const r = await performBackupExport(d, 'a.json', '{}');
    expect(r).toEqual({ ok: true, sharedWith: 'org.telegram.messenger', savedPath: 'Documents/Apartemant/a.json' });
    expect(d.share).toHaveBeenCalledWith('file:///cache/a.json');
  });

  it('کاربر پنجره اشتراک‌گذاری را بست («Share canceled») ← ناموفق: فایل به اشتراک گذاشته نشد', async () => {
    const r = await performBackupExport(deps({ share: async () => { throw new Error('Share canceled'); } }), 'a.json', '{}') as Fail;
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('shareCancelled');
    expect(failureReason(r)).toBe(BACKUP_FAIL_SHARE);
  });

  it('نتیجهٔ بدون مقصد (activityType خالی/نبود) تأییدشده حساب نمی‌شود', async () => {
    for (const res of [{ activityType: '' }, {}, undefined, { activityType: '   ' }]) {
      const r = await performBackupExport(deps({ share: async () => res as never }), 'a.json', '{}') as Fail;
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('shareCancelled');
    }
  });

  it('نوشتن/تأیید فایل ناموفق ← «فایل ذخیره نشد» و اشتراک‌گذاری اصلاً باز نمی‌شود', async () => {
    const d = deps({ writeTemp: async () => { throw new Error('disk full'); } });
    const r = await performBackupExport(d, 'a.json', '{}') as Fail;
    expect(r.reason).toBe('saveFailed');
    expect(failureReason(r)).toBe(BACKUP_FAIL_SAVE);
    expect(d.share).not.toHaveBeenCalled();
  });

  it('خطای واقعی اشتراک‌گذاری ← متن همان خطا', async () => {
    const r = await performBackupExport(deps({ share: async () => { throw new Error('Can\'t share while sharing is in progress'); } }), 'a.json', '{}') as Fail;
    expect(r.reason).toBe('error');
    expect(failureReason(r)).toBe("Can't share while sharing is in progress");
    const empty = await performBackupExport(deps({ share: async () => { throw new Error(''); } }), 'a.json', '{}') as Fail;
    expect(failureReason(empty)).toBe('خطای ناشناخته');
  });

  it('ذخیرهٔ نسخهٔ Documents شکست بخورد، مانع اشتراک‌گذاری نیست؛ و در پیام ناموفق نسخهٔ محلی ذکر می‌شود', async () => {
    const ok = await performBackupExport(deps({ saveCopy: async () => { throw new Error('perm'); } }), 'a.json', '{}');
    expect(ok).toEqual({ ok: true, sharedWith: 'org.telegram.messenger', savedPath: null });
    const cancelled = await performBackupExport(deps({ share: async () => { throw new Error('Share canceled'); } }), 'a.json', '{}') as Fail;
    const err = exportFailureError(cancelled);
    expect(err.title).toBe(BACKUP_FAIL_TITLE);
    expect(err.message).toContain(BACKUP_FAIL_SHARE);
    expect(err.message).toContain('Documents/Apartemant/a.json');
    const noCopy = exportFailureError({ ...cancelled, savedPath: null });
    expect(noCopy.message).toBe(`${BACKUP_FAIL_SHARE}.`);
  });

  it('مرورگر: دانلود؛ خطای دانلود ناموفق است', async () => {
    const d = deps({ isNative: false });
    expect(await performBackupExport(d, 'a.json', '{}')).toEqual({ ok: true, sharedWith: null, savedPath: null });
    expect(d.download).toHaveBeenCalledWith('a.json', '{}');
    const bad = await performBackupExport(deps({ isNative: false, download: () => { throw new Error('blocked'); } }), 'a.json', '{}') as Fail;
    expect(bad.ok).toBe(false);
    expect(failureReason(bad)).toBe('blocked');
  });

  it('تشخیص لغو از پیام خطا', () => {
    expect(isShareCancel(new Error('Share canceled'))).toBe(true);
    expect(isShareCancel('cancelled by user')).toBe(true);
    expect(isShareCancel(new Error('boom'))).toBe(false);
  });
});
