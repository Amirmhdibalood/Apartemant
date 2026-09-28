import { BuildingIllustration, CitySkyline } from '../components/Illustrations';
import { IconAlertTriangle, IconBook, IconChart, IconChevronLeft, IconGear, IconHistory, IconPlus, IconX } from '../components/Icons';
import type { TabId } from '../components/BottomNav';
import type { DueAlert } from '../logic/dueAlerts';

interface Props {
  onNewBill: () => void;
  onOpen: (t: TabId) => void;
  /** هشدارهای مهلت پرداخت (فردا / امروز / گذشته) که در این اجرا بسته نشده‌اند */
  alerts?: DueAlert[];
  onOpenBill?: (billId: string) => void;
  onDismiss?: (key: string) => void;
}

/** ۱. صفحه اصلی */
export function HomeScreen({ onNewBill, onOpen, alerts = [], onOpenBill, onDismiss }: Props) {
  return (
    <main className="screen screen--home">
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
