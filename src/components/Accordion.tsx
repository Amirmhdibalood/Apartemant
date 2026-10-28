import { useId, useState, type ReactNode } from 'react';
import { IconChevronDown, IconHelp } from './Icons';
import { isAccordionOpen, setAccordionOpen } from '../logic/accordionState';

interface Props {
  /** شناسهٔ پایدار برای نگه‌داشتن وضعیت در همین نشست */
  id: string;
  title: string;
  /** توضیح کوتاه زیر عنوان (مثلاً معنی سوییچ کنار عنوان) */
  titleHint?: string;
  children: ReactNode;
  className?: string;
  /** لینک «راهنمای این بخش» بالای محتوا */
  onTopic?: () => void;
  /** کنترل کنار عنوان (مثلاً سوییچ) — باز/بسته کردن آکاردئون را تریگر نمی‌کند */
  trailing?: ReactNode;
}

/**
 * کارت آکاردئونی: با لمس نوار عنوان باز/بسته می‌شود (پیش‌فرض بسته).
 */
export function Accordion({ id, title, titleHint, children, className = '', onTopic, trailing }: Props) {
  const [open, setOpen] = useState(() => isAccordionOpen(id));
  const uid = useId();
  const headId = `${uid}-head`;
  const bodyId = `${uid}-body`;
  const toggle = () => {
    setAccordionOpen(id, !open);
    setOpen(!open);
  };
  return (
    <section className={'card settings-card acc' + (open ? ' is-open' : '') + (className ? ' ' + className : '')} data-acc={id}>
      <h2 className={'acc__title' + (trailing ? ' has-trailing' : '') + (titleHint ? ' has-hint' : '')} id={headId}>
        <button type="button" className="acc__head" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <span className="acc__text">
            <span className="acc__label">{title}</span>
            {titleHint ? <span className="acc__hint">{titleHint}</span> : null}
          </span>
          <IconChevronDown size={22} className="acc__chevron" />
        </button>
        {trailing ? <div className="acc__trailing">{trailing}</div> : null}
      </h2>
      <div id={bodyId} className="acc__body" role="region" aria-labelledby={headId}>
        <div className="acc__inner"><div className="acc__pad">
          {onTopic && (
            <button type="button" className="acc__help" onClick={onTopic}><IconHelp size={16} /><span>راهنمای این بخش</span></button>
          )}
          {children}
        </div></div>
      </div>
    </section>
  );
}
