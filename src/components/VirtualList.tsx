import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';

interface Props<T> {
  items: T[];
  /** Approximate row height in px (fixed estimate; overscan covers variance). */
  estimateHeight?: number;
  overscan?: number;
  className?: string;
  style?: CSSProperties;
  /** Stable key per item */
  keyOf: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Optional empty placeholder */
  empty?: ReactNode;
}

/**
 * Lightweight windowed list (no extra dependency). Renders only visible rows + overscan.
 * Parent should be the scroll container (or window). Uses window scroll by default when
 * no scrollParentRef is provided — here we listen to window / nearest scrollable.
 */
export function VirtualList<T>({
  items, estimateHeight = 88, overscan = 6, className, style, keyOf, renderItem, empty,
}: Props<T>) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);

  const onScroll = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Prefer nearest scrollable ancestor; fall back to window
    let node: HTMLElement | null = el.parentElement;
    while (node && node !== document.body) {
      const oy = getComputedStyle(node).overflowY;
      if (oy === 'auto' || oy === 'scroll' || node.scrollHeight > node.clientHeight + 1) {
        setScrollTop(node.scrollTop);
        setViewH(node.clientHeight);
        return;
      }
      node = node.parentElement;
    }
    setScrollTop(window.scrollY || document.documentElement.scrollTop);
    setViewH(window.innerHeight);
  }, []);

  useEffect(() => {
    onScroll();
    const el = wrapRef.current;
    let scrollNode: HTMLElement | Window = window;
    if (el) {
      let node: HTMLElement | null = el.parentElement;
      while (node && node !== document.body) {
        const oy = getComputedStyle(node).overflowY;
        if (oy === 'auto' || oy === 'scroll' || node.scrollHeight > node.clientHeight + 1) {
          scrollNode = node;
          break;
        }
        node = node.parentElement;
      }
    }
    scrollNode.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scrollNode.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [onScroll, items.length]);

  const total = items.length;
  const { start, end, offset } = useMemo(() => {
    const startIdx = Math.max(0, Math.floor(scrollTop / estimateHeight) - overscan);
    const visible = Math.ceil(viewH / estimateHeight) + overscan * 2;
    const endIdx = Math.min(total, startIdx + visible);
    return { start: startIdx, end: endIdx, offset: startIdx * estimateHeight };
  }, [scrollTop, viewH, estimateHeight, overscan, total]);

  if (total === 0) return <>{empty ?? null}</>;
  // Small lists: no windowing overhead
  if (total <= 40) {
    return (
      <div className={className} style={style} ref={wrapRef}>
        {items.map((it, i) => <div key={keyOf(it, i)}>{renderItem(it, i)}</div>)}
      </div>
    );
  }

  const height = total * estimateHeight;
  const slice = items.slice(start, end);

  return (
    <div className={className} style={{ ...style, height, position: 'relative' }} ref={wrapRef}>
      <div style={{ position: 'absolute', top: offset, left: 0, right: 0 }}>
        {slice.map((it, i) => {
          const idx = start + i;
          return (
            <div key={keyOf(it, idx)} style={{ minHeight: estimateHeight }}>
              {renderItem(it, idx)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
