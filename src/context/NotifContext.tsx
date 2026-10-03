import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useDueAlerts } from '../hooks/useDueAlerts';
import type { DueAlert } from '../logic/dueAlerts';
import { DEFAULT_NOTIF_MODE, type NotifMode } from '../logic/notifMode';
import { notifModeRepository } from '../storage/notifModeRepository';

interface NotifCtx {
  /** همه اعلان‌های فعال (زنگوله و عدد زبانه سوابق) */
  all: DueAlert[];
  /** اعلان‌هایی که بنر صفحه اصلی هنوز بسته نشده */
  visible: DueAlert[];
  dismissBanner: (key: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  mode: NotifMode;
  setMode: (m: NotifMode) => void;
}

const Ctx = createContext<NotifCtx | null>(null);

/** مرکز اعلان‌های داخل برنامه (بدون اعلان سیستمی و بدون مجوز) */
export function NotifProvider({ children }: { children: ReactNode }) {
  const due = useDueAlerts();
  const [open, setOpen] = useState(false);
  const [mode, setModeState] = useState<NotifMode>(DEFAULT_NOTIF_MODE);

  useEffect(() => {
    let alive = true;
    notifModeRepository.get().then((m) => { if (alive) setModeState(m); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const setMode = useCallback((m: NotifMode) => {
    setModeState(m);
    void notifModeRepository.save(m).catch(() => undefined);
  }, []);

  return (
    <Ctx.Provider value={{ all: due.all, visible: due.visible, dismissBanner: due.dismiss, open, setOpen, mode, setMode }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNotif(): NotifCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useNotif must be used inside NotifProvider');
  return c;
}
