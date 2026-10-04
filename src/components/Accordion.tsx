import { useId, useState, type ReactNode } from 'react';
import { IconChevronDown, IconHelp } from './Icons';
import { isAccordionOpen, setAccordionOpen } from '../logic/accordionState';

interface Props {
  /** شناسهٔ پایدار برای نگه‌داشتن وضعیت در همین نشست */
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
  /** لینک «راهنمای این بخش» بالای محتوا (باز کردن موضوع آموزش همین بخش) */
  onTopic?: () => void;
}

/**
 * کارت آکاردئونی: با لمس نوار عنوان باز/بسته می‌شود (پیش‌فرض بسته).
 * عنوان یک <h2> حاوی <button aria-expanded> است؛ محتوای بسته visibility:hidden است تا فوکوس نگیرد.
 */
export function Accordion({ id, title, children, className = '', onTopic }: Props) {
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
      <h2 className="acc__title" id={headId}>
        <button type="button" className="acc__head" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <span className="acc__label">{title}</span>
          <IconChevronDown size={22} className="acc__chevron" />
        </button>
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
