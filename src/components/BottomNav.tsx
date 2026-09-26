import { IconBook, IconChart, IconGear, IconHome, IconCalendar } from './Icons';

export type TabId = 'home' | 'tutorial' | 'records' | 'report' | 'settings';

const TABS: { id: TabId; label: string; Icon: typeof IconHome }[] = [
  { id: 'home', label: 'خانه', Icon: IconHome },
  { id: 'tutorial', label: 'آموزش', Icon: IconBook },
  { id: 'records', label: 'سوابق', Icon: IconCalendar },
  { id: 'report', label: 'گزارش‌ها', Icon: IconChart },
  { id: 'settings', label: 'تنظیمات', Icon: IconGear },
];

export function BottomNav({ active, onSelect }: { active: TabId | null; onSelect: (t: TabId) => void }) {
  return (
    <nav className="bottom-nav" aria-label="منوی اصلی">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={'bottom-nav__item' + (active === id ? ' is-active' : '')}
          onClick={() => onSelect(id)}
          aria-current={active === id ? 'page' : undefined}
        >
          <Icon size={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
