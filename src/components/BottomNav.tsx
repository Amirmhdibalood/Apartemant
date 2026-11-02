import { IconBook, IconChart, IconGear, IconHome, IconCalendar } from './Icons';

export type TabId = 'home' | 'tutorial' | 'records' | 'report' | 'settings';

/** ۱.۹: راست به چپ «سوابق · گزارش‌ها · خانه (وسط، برجسته) · آموزش · تنظیمات» */
const TABS: { id: TabId; label: string; Icon: typeof IconHome }[] = [
  { id: 'records', label: 'سوابق', Icon: IconCalendar },
  { id: 'report', label: 'گزارش‌ها', Icon: IconChart },
  { id: 'home', label: 'خانه', Icon: IconHome },
  { id: 'tutorial', label: 'آموزش', Icon: IconBook },
  { id: 'settings', label: 'تنظیمات', Icon: IconGear },
];

export function BottomNav({ active, onSelect, badges = {} }: { active: TabId | null; onSelect: (t: TabId) => void; badges?: Partial<Record<TabId, number>> }) {
  return (
    <nav className="bottom-nav" aria-label="منوی اصلی">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={'bottom-nav__item' + (id === 'home' ? ' bottom-nav__item--home' : '') + (active === id ? ' is-active' : '')}
          onClick={() => onSelect(id)}
          aria-current={active === id ? 'page' : undefined}
        >
          <span className="bottom-nav__icon">
            <Icon size={id === 'home' ? 24 : 22} />
            {(badges[id] ?? 0) > 0 && (
              <span className="nav-badge num" aria-label={`${badges[id]} هشدار مهلت پرداخت`}>{badges[id]}</span>
            )}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
