import type { ReactNode } from 'react';
import { BuildingIllustration, CitySkyline } from '../components/Illustrations';
import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconCalendarCheck, IconChevronLeft, IconPlus, IconUsers, IconX } from '../components/Icons';
import { SupportButton } from '../components/AppHeader';
import { ThemeToggle } from '../components/ThemeToggle';
import { NotifBell } from '../components/NotifBell';
import { bannerFor, type DueAlert } from '../logic/dueAlerts';
import type { NotifMode } from '../logic/notifMode';
import { toPersianDigits } from '../logic/formatting';
import { usePeriods } from '../hooks/usePeriods';
import { activePeriod, managerDisplayName } from '../logic/periods';
import { todayKeyNow } from '../storage/periodsRepository';
import { buildingRepository } from '../storage/buildingRepository';
import { billRepository } from '../storage/billRepository';


function useHomeCards() {
  const { state } = usePeriods();
  const [meeting, setMeeting] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = () => {
      void buildingRepository.listMeetings().then((m) => { if (alive) setMeeting(m[0]?.meetingDate ?? null); }).catch(() => undefined);
    };
    load();
    const offs = [buildingRepository.onActiveChange(load), billRepository.onChange(load)];
    return () => { alive = false; offs.forEach((o) => o()); };
  }, []);
  let periods = '';
  if (state) {
    const parts = [`سال ${toPersianDigits(state.currentYear)}`];
    if (state.mgmtEnabled) {
      const p = activePeriod(state.periods, todayKeyNow());
      parts.push(p ? `مدیر: ${managerDisplayName(p)}` : 'مدیر فعالی نیست');
    }
    periods = parts.join(' · ');
  }
  const meetingText = meeting === undefined ? '' : meeting ? `آخرین جلسه: ${toPersianDigits(meeting.replace(/-/g, '/'))}` : 'هنوز جلسه‌ای ثبت نشده';
  return { periods, meetingText };
}

interface Props {
  onNewBill: () => void;
  /** کارت‌های صفحهٔ اصلی (۱.۹.۲): دوره‌ها، جلسه (پشتیبان‌گیری فقط در تنظیمات) */
  onOpen: (t: 'periods' | 'meetings') => void;
  /** هشدارهای مهلت پرداخت (فردا / امروز / گذشته) که در این اجرا بسته نشده‌اند */
  alerts?: DueAlert[];
  onOpenBill?: (billId: string) => void;
  onDismiss?: (key: string) => void;
  /** باز کردن «پشتیبانی» (کنار زنگوله (اعلان)) */
  onSupport?: () => void;
  /** حالت نمایش اعلان‌ها (در «پنجره پایین» بنر فشرده می‌شود) */
  mode?: NotifMode;
  /** باز کردن مرکز اعلان‌ها (زنگوله) */
  onShowAll?: () => void;
}

/** ۱. صفحه اصلی */
export function HomeScreen({ onNewBill, onOpen, alerts: visible = [], onOpenBill, onDismiss, onSupport, mode = 'sheet', onShowAll }: Props) {
  const { shown: alerts, more } = bannerFor(visible, mode);
  const cards = useHomeCards();
  return (
    <main className="screen screen--home">
      {onSupport && <div className="home-topbar"><NotifBell /><SupportButton onSupport={onSupport} /><ThemeToggle /></div>}
      {alerts.length > 0 && (
        <section className="due-alerts" aria-label="هشدار مهلت پرداخت">
          {alerts.map((a) => (
            <div key={a.key} className={'due-alert is-' + a.kind} role="alert">
              <button type="button" className="due-alert__main" onClick={() => onOpenBill?.(a.billId)}>
                <span className="due-alert__icon"><IconAlertTriangle size={20} /></span>
                <span className="due-alert__text">{a.text}</span>
                <IconChevronLeft size={16} className="due-alert__arrow" />
              </button>
              <button type="button" className="due-alert__close" aria-label="بستن هشدار" onClick={() => onDismiss?.(a.key)}>
                <IconX size={16} />
              </button>
            </div>
          ))}
          {more > 0 && (
            <button type="button" className="due-more" onClick={onShowAll}>
              <span>و <span className="num">{toPersianDigits(more)}</span> اعلان دیگر — مشاهده همه</span>
              <IconChevronLeft size={14} />
            </button>
          )}
        </section>
      )}
      <div className="home">
        <BuildingIllustration />
        <h1 className="home__title">محاسبه شارژ ساختمان</h1>
        <p className="home__subtitle">مدیریت آسان هزینه‌های ساختمان</p>

        <button type="button" className="btn btn--primary btn--lg home__cta" onClick={onNewBill}>
          <IconPlus size={24} className="home__cta-icon" />
          <span>ثبت قبض جدید</span>
        </button>

        <div className="home-cards">
          <HomeCard tone="purple" icon={<IconCalendarCheck size={22} />} title="دوره‌ها" sub={cards.periods} onClick={() => onOpen('periods')} />
          <HomeCard tone="green" icon={<IconUsers size={22} />} title="جلسه" sub={cards.meetingText} onClick={() => onOpen('meetings')} />
        </div>
      </div>
      <CitySkyline />
    </main>
  );
}

function HomeCard({ tone, icon, title, sub, onClick }: { tone: 'purple' | 'green' | 'blue'; icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" className="home-card" onClick={onClick}>
      <span className={'home-card__icon is-' + tone} aria-hidden="true">{icon}</span>
      <span className="home-card__txt">
        <span className="home-card__title">{title}</span>
        {sub && <span className="home-card__sub">{sub}</span>}
      </span>
      <IconChevronLeft size={18} className="home-card__arrow" />
    </button>
  );
}
