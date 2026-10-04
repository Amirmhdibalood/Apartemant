import { BuildingIllustration, CitySkyline } from '../components/Illustrations';
import { IconAlertTriangle, IconBook, IconChart, IconChevronLeft, IconGear, IconHistory, IconPlus, IconX } from '../components/Icons';
import type { TabId } from '../components/BottomNav';
import { HelpButton, SupportButton } from '../components/AppHeader';
import { ThemeToggle } from '../components/ThemeToggle';
import { NotifBell } from '../components/NotifBell';
import { bannerFor, type DueAlert } from '../logic/dueAlerts';
import type { NotifMode } from '../logic/notifMode';
import { toPersianDigits } from '../logic/formatting';

interface Props {
  onNewBill: () => void;
  onOpen: (t: TabId) => void;
  /** هشدارهای مهلت پرداخت (فردا / امروز / گذشته) که در این اجرا بسته نشده‌اند */
  alerts?: DueAlert[];
  onOpenBill?: (billId: string) => void;
  onDismiss?: (key: string) => void;
  /** باز کردن آموزش (دکمه «؟» بالا-چپ) */
  onHelp?: () => void;
  /** باز کردن «پشتیبانی» (آیکن هدست کنار زنگوله) */
  onSupport?: () => void;
  /** حالت نمایش اعلان‌ها (در «پنجره پایین» بنر فشرده می‌شود) */
  mode?: NotifMode;
  /** باز کردن مرکز اعلان‌ها (زنگوله) */
  onShowAll?: () => void;
}

/** ۱. صفحه اصلی */
export function HomeScreen({ onNewBill, onOpen, alerts: visible = [], onOpenBill, onDismiss, onHelp, onSupport, mode = 'sheet', onShowAll }: Props) {
  const { shown: alerts, more } = bannerFor(visible, mode);
  return (
    <main className="screen screen--home">
      {onHelp && <div className="home-topbar"><NotifBell />{onSupport && <SupportButton onSupport={onSupport} />}<HelpButton onHelp={onHelp} /><ThemeToggle /></div>}
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
        <p className="home__subtitle">
          مدیریت آسان هزینه‌های ساختمان
          <br />
          با محاسبه عادلانه سهم هر واحد
        </p>

        <button type="button" className="btn btn--primary btn--lg home__cta" onClick={onNewBill}>
          <IconPlus size={24} className="home__cta-icon" />
          <span>ثبت قبض جدید</span>
        </button>

        <button type="button" className="menu-btn" onClick={() => onOpen('records')}>
          <IconHistory size={24} className="menu-btn__icon menu-btn__icon--green" />
          <span>سوابق</span>
        </button>
        <button type="button" className="menu-btn" onClick={() => onOpen('report')}>
          <IconChart size={24} className="menu-btn__icon menu-btn__icon--blue" />
          <span>گزارش‌ها</span>
        </button>
        <button type="button" className="menu-btn" onClick={() => onOpen('tutorial')}>
          <IconBook size={24} className="menu-btn__icon menu-btn__icon--green" />
          <span>آموزش</span>
        </button>
        <button type="button" className="menu-btn" onClick={() => onOpen('settings')}>
          <IconGear size={24} className="menu-btn__icon" />
          <span>تنظیمات</span>
        </button>
      </div>
      <CitySkyline />
    </main>
  );
}
