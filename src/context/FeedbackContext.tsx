/**
 * هماهنگ‌کننده بازخوردها: Error، Warning، Dialog قفل ویرایش، تأیید حذف و Toast.
 * Error و Warning دو مسیر کاملاً جدا دارند:
 *   - showErrors(): فقط نمایش، بدون «دیگر نمایش نده»
 *   - confirmWarning(): اگر کاربر قبلاً «دیگر نمایش نده» زده باشد بلافاصله true برمی‌گرداند
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { WarningId } from '../models/types';
import type { AppError } from '../logic/errors';
import { WARNINGS, dismissWarning, shouldShowWarning, type AppWarning } from '../logic/warnings';
import { ErrorDialog } from '../components/ErrorDialog';
import { WarningDialog } from '../components/WarningDialog';
import { LockedDialog } from '../components/LockedDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Toast } from '../components/Toast';
import { useSettings } from './SettingsContext';

interface ConfirmOpts { title: string; text: string; confirmLabel: string; tone?: 'danger' | 'warning' }

interface FeedbackCtx {
  showErrors: (errors: AppError | AppError[]) => void;
  confirmWarning: (id: WarningId) => Promise<boolean>;
  showLocked: () => void;
  confirmDanger: (opts: ConfirmOpts) => Promise<boolean>;
  toast: (message: string) => void;
}

const Ctx = createContext<FeedbackCtx | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const [errors, setErrors] = useState<AppError[] | null>(null);
  const [warning, setWarning] = useState<AppWarning | null>(null);
  const warningResolve = useRef<((v: boolean) => void) | null>(null);
  const [locked, setLocked] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmOpts | null>(null);
  const confirmResolve = useRef<((v: boolean) => void) | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const showErrors = useCallback((e: AppError | AppError[]) => {
    setErrors(Array.isArray(e) ? e : [e]);
  }, []);

  const confirmWarning = useCallback((id: WarningId) => {
    if (!shouldShowWarning(id, settingsRef.current)) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      warningResolve.current = resolve;
      setWarning(WARNINGS[id]);
    });
  }, []);

  const onWarningResult = (confirmed: boolean, dontShowAgain: boolean) => {
    const w = warning;
    setWarning(null);
    if (w && confirmed && dontShowAgain) updateSettings((s) => dismissWarning(w.id, s));
    warningResolve.current?.(confirmed);
    warningResolve.current = null;
  };

  const confirmDanger = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => {
      confirmResolve.current = resolve;
      setConfirm(opts);
    });
  }, []);

  const toast = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current);
    setToastMsg(message);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2800);
  }, []);

  const showLocked = useCallback(() => setLocked(true), []);

  return (
    <Ctx.Provider value={{ showErrors, confirmWarning, showLocked, confirmDanger, toast }}>
      {children}
      <ErrorDialog errors={errors} onClose={() => setErrors(null)} />
      <WarningDialog warning={warning} onResult={onWarningResult} />
      <LockedDialog open={locked} onClose={() => setLocked(false)} />
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        text={confirm?.text ?? ''}
        confirmLabel={confirm?.confirmLabel ?? ''}
        tone={confirm?.tone}
        onResult={(ok) => {
          setConfirm(null);
          confirmResolve.current?.(ok);
          confirmResolve.current = null;
        }}
      />
      <Toast message={toastMsg} onClose={() => setToastMsg(null)} />
    </Ctx.Provider>
  );
}

export function useFeedback(): FeedbackCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useFeedback must be used inside FeedbackProvider');
  return c;
}
