import { useCallback, useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { billRepository } from '../storage/billRepository';
import { selectDueAlerts, withoutDismissed, type DueAlert } from '../logic/dueAlerts';
import { todayJalali } from '../logic/jalali';

/**
 * هشدارهای مهلت پرداخت برای صفحه اصلی: هنگام اجرا، پس از هر تغییر قبض‌ها (ذخیره، پرداخت شد، مهلت، حذف، بازگردانی،
 * بازیابی پشتیبان) و هنگام برگشتن به برنامه دوباره محاسبه می‌شوند. کارت‌های بسته‌شده فقط تا اجرای بعدی برنامه
 * (یا برگشتن دوباره به برنامه از پس‌زمینه) پنهان می‌مانند.
 */
export function useDueAlerts() {
  const [all, setAll] = useState<DueAlert[]>([]);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());

  const refresh = useCallback(async () => {
    const bills = (await billRepository.getAll().catch(() => [])).map((x) => x.bill);
    setAll(selectDueAlerts(bills, todayJalali()));
  }, []);

  useEffect(() => {
    void refresh();
    const off = billRepository.onChange(() => { void refresh(); });
    let sub: Promise<{ remove: () => Promise<void> }> | null = null;
    if (Capacitor.isNativePlatform()) {
      sub = CapApp.addListener('resume', () => { setDismissed(new Set()); void refresh(); });
    }
    return () => { off(); void sub?.then((h) => h.remove()); };
  }, [refresh]);

  const dismiss = useCallback((key: string) => setDismissed((s) => new Set(s).add(key)), []);

  return { all, visible: withoutDismissed(all, dismissed), dismiss };
}
