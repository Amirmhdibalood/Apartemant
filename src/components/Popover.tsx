import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  /** فیلدی که فهرست زیرش (یا اگر جا نبود، بالایش) باز می‌شود */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  id?: string;
  role?: string;
  ariaLabel?: string;
  ariaMultiselectable?: boolean;
  /** کمترین پهنا (مثلاً برای خانهٔ کوچک ماه در فیلد تاریخ) */
  minWidth?: number;
  className?: string;
}

const GAP = 6;
const EDGE = 8;
const MAX_H = 300;

/**
 * فهرست شناور سراسری (۱.۹): روی صفحه می‌نشیند و چیدمان/اسکرول صفحه را جابه‌جا نمی‌کند؛
 * اگر پایین جا نباشد رو به بالا باز می‌شود. لمس بیرون یا Escape (دکمهٔ برگشت) آن را می‌بندد؛
 * لمس خودِ فیلد را فیلد مدیریت می‌کند (باز/بسته).
 */
export function Popover({ open, anchorRef, onClose, children, id, role, ariaLabel, ariaMultiselectable, minWidth = 0, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number; up: boolean } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const place = useCallback(() => {
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(vw - EDGE * 2, Math.max(r.width, minWidth));
    // RTL: لبهٔ راست فهرست با لبهٔ راست فیلد هم‌تراز؛ داخل صفحه نگه داشته می‌شود
    const left = Math.max(EDGE, Math.min(r.right - width, vw - EDGE - width));
    const content = ref.current?.scrollHeight ?? MAX_H;
    const want = Math.min(MAX_H, content);
    const below = vh - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const up = below < want && above > below;
    const maxHeight = Math.max(120, Math.min(MAX_H, up ? above : below));
    setPos(up ? { left, width, bottom: vh - r.top + GAP, maxHeight, up } : { left, width, top: r.bottom + GAP, maxHeight, up });
  }, [anchorRef, minWidth]);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return;
      closeRef.current();
      // لمس بیرون فقط فهرست را می‌بندد؛ همان لمس چیزی زیرش را (کارت قبض، زبانهٔ نوار پایین…) باز نکند
      const swallow = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); };
      document.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener('click', swallow, true), 450);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); closeRef.current(); }
    };
    const onMove = () => place();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, place, anchorRef]);

  // بعد از اولین چیدمان، ارتفاع واقعی محتوا معلوم است → یک بار دیگر جا انداخته می‌شود (برای تصمیم بالا/پایین)
  useLayoutEffect(() => { if (open && pos && ref.current) place(); }, [open, pos === null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      id={id}
      role={role}
      aria-label={ariaLabel}
      aria-multiselectable={ariaMultiselectable || undefined}
      className={'year-picker option-picker popover' + (pos?.up ? ' is-up' : '') + (className ? ' ' + className : '')}
      style={pos
        ? { position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }
        : { position: 'fixed', left: -9999, top: 0, visibility: 'hidden' }}
    >
      <div className="year-picker__list popover__list" style={pos ? { maxHeight: pos.maxHeight - 2 } : undefined}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
