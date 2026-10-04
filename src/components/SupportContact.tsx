import { useRef } from 'react';
import { IconChat, IconCopy, IconMail, IconPhone, IconSend } from './Icons';
import { useFeedback } from '../context/FeedbackContext';
import { copyText } from '../services/clipboard';
import { buildSupportItems, type SupportId, type SupportItem } from '../logic/support';
import { SUPPORT, type SupportConfig } from '../config/support';

const ICONS: Record<SupportId, typeof IconMail> = { email: IconMail, phone: IconPhone, bale: IconChat, telegram: IconSend };
const LONG_PRESS_MS = 550;

/**
 * ردیف‌های تماس: لمس = باز شدن برنامهٔ مربوط (لینک ساده؛ Capacitor آن را بی‌مجوز به برنامهٔ دیگر می‌دهد)،
 * نگه داشتن انگشت یا دکمهٔ کپی = کپی مقدار. فقط ردیف‌های معتبر نمایش داده می‌شوند.
 */
export function SupportContact({ cfg = SUPPORT, version }: { cfg?: SupportConfig; version?: string }) {
  const { toast } = useFeedback();
  const items = buildSupportItems(cfg, version);
  const timer = useRef<number | null>(null);
  const suppress = useRef(false);

  const copy = async (it: SupportItem) => {
    const ok = await copyText(it.copy);
    toast(ok ? 'کپی شد.' : 'کپی انجام نشد.');
  };
  const down = (it: SupportItem) => {
    suppress.current = false;
    timer.current = window.setTimeout(() => { suppress.current = true; void copy(it); }, LONG_PRESS_MS);
  };
  const clear = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; };

  if (items.length === 0) return null;
  return (
    <>
      {items.map((it) => {
        const Icon = ICONS[it.id];
        return (
          <div className="sp-row" key={it.id} data-support={it.id}>
            <a
              className="sp-row__main"
              href={it.href}
              onPointerDown={() => down(it)}
              onPointerUp={clear}
              onPointerLeave={clear}
              onPointerCancel={clear}
              onContextMenu={(e) => e.preventDefault()}
              onClick={(e) => { clear(); if (suppress.current) { e.preventDefault(); suppress.current = false; } }}
            >
              <span className="sp-ic"><Icon size={22} /></span>
              <span className="sp-tx">
                <small>{it.label}</small>
                <b dir="ltr">{it.display}</b>
                <em>{it.hint}</em>
              </span>
            </a>
            <button type="button" className="sp-cp" onClick={() => void copy(it)} aria-label={`کپی ${it.label}`}><IconCopy size={20} /></button>
          </div>
        );
      })}
    </>
  );
}
