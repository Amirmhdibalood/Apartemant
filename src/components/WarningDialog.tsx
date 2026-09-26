import { useEffect, useState } from 'react';
import type { AppWarning } from '../logic/warnings';
import { Checkbox } from './Checkbox';
import { Dialog } from './Dialog';
import { IconAlertTriangle } from './Icons';

interface Props {
  warning: AppWarning | null;
  /** dontShowAgain: وضعیت چک‌باکس «دیگر این پیام را نمایش نده» */
  onResult: (confirmed: boolean, dontShowAgain: boolean) => void;
}

/**
 * نمایش هشدار (Warning): آیکون زرد + چک‌باکس «دیگر این پیام را نمایش نده»
 */
export function WarningDialog({ warning, onResult }: Props) {
  const [dontShow, setDontShow] = useState(false);
  useEffect(() => { setDontShow(false); }, [warning]);
  const hasCancel = !!warning?.cancelLabel;

  return (
    <Dialog open={!!warning} onClose={() => onResult(false, false)} labelledBy="warning-title" variant="warning">
      {warning && (
        <>
          <div className="dialog__icon"><IconAlertTriangle size={54} /></div>
          <h2 id="warning-title" className="dialog__title">{warning.title}</h2>
          {warning.lines.map((l, i) => (
            <p key={i} className="dialog__text">{l}</p>
          ))}
          <Checkbox
            className="dialog__dont-show"
            checked={dontShow}
            onChange={setDontShow}
            label="دیگر این پیام را نمایش نده"
          />
          <div className={'dialog__actions' + (hasCancel ? ' dialog__actions--two' : '')}>
            <button type="button" className="btn btn--primary" onClick={() => onResult(true, dontShow)}>
              {warning.confirmLabel}
            </button>
            {hasCancel && (
              <button type="button" className="btn btn--muted" onClick={() => onResult(false, false)}>
                {warning.cancelLabel}
              </button>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
