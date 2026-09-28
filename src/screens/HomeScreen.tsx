import { BuildingIllustration, CitySkyline } from '../components/Illustrations';
import { IconBook, IconChart, IconGear, IconHistory, IconPlus } from '../components/Icons';
import type { TabId } from '../components/BottomNav';

interface Props {
  onNewBill: () => void;
  onOpen: (t: TabId) => void;
}

/** ۱. صفحه اصلی */
export function HomeScreen({ onNewBill, onOpen }: Props) {
  return (
    <main className="screen screen--home">
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
