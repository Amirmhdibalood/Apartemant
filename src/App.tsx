import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { BillDraft, BillWithUnits } from './models/types';
import type { Route } from './navigation';
import { TAB_ROUTES } from './navigation';
import { BottomNav, type TabId } from './components/BottomNav';
import { useSettings } from './context/SettingsContext';
import { currentJalali } from './logic/date';
import { defaultBillYear } from './logic/periods';
import { periodsRepository } from './storage/periodsRepository';
import { PeriodsScreen } from './screens/PeriodsScreen';
import { MeetingsScreen } from './screens/MeetingsScreen';
import { BackupScreen } from './screens/BackupScreen';
import { emptyDraft } from './logic/billFactory';
import { buildingRepository } from './storage/buildingRepository';
import { HomeScreen } from './screens/HomeScreen';
import { NewBillScreen } from './screens/NewBillScreen';
import { ResultScreen } from './screens/ResultScreen';
import { RecordsScreen } from './screens/RecordsScreen';
import { ReportsScreen } from './screens/ReportsScreen';
import { UnitHistoryScreen } from './screens/UnitHistoryScreen';
import { UnitPaymentScreen } from './screens/UnitPaymentScreen';
import { BillDetailsScreen } from './screens/BillDetailsScreen';
import { TutorialScreen } from './screens/TutorialScreen';
import { SupportScreen } from './screens/SupportScreen';
import { QUICK_TOPIC, routeForTarget, type HelpTarget } from './logic/help';
import { setAccordionOpen } from './logic/accordionState';
import { SettingsScreen } from './screens/SettingsScreen';
import { IntroScreen } from './screens/IntroScreen';
import { BillSavedDialog } from './components/BillSavedDialog';
import { useNotif } from './context/NotifContext';
import { NotificationsLayer } from './components/NotificationsLayer';
import { onboardingRepository } from './storage/onboardingRepository';
import { billRepository } from './storage/billRepository';
import { useFeedback } from './context/FeedbackContext';
import { formatJalaliKey, todayJalali } from './logic/jalali';
import { newBillBlockers } from './logic/billGate';

export default function App() {
  const { loaded } = useSettings();
  const { showErrors } = useFeedback();
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const [draft, setDraft] = useState<BillDraft | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  /** مرحله موفقیت پس از ذخیره قبض (پیش‌نمایش و خروجی تصویر) */
  const [justSaved, setJustSaved] = useState<BillWithUnits | null>(null);
  const route = stack[stack.length - 1];
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const push = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const replaceTop = useCallback((r: Route) => setStack((s) => [...s.slice(0, -1), r]), []);
  const resetTo = useCallback((r: Route) => setStack(r.name === 'home' ? [r] : [{ name: 'home' }, r]), []);

  // دکمه Back سخت‌افزاری اندروید
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = CapApp.addListener('backButton', () => {
      if (document.querySelector('.intro')) return;
      if (document.querySelector('.popover')) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return; }
      if (document.querySelector('.pv')) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return; }
      if (notifRef.current.open) { notifRef.current.setOpen(false); return; }
      if (document.querySelector('.dialog-backdrop')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        return;
      }
      if (stackRef.current.length > 1) back();
      else void CapApp.exitApp();
    });
    return () => { void sub.then((h) => h.remove()); };
  }, [back]);

  // هشدار مهلت پرداخت داخل برنامه (صفحه اصلی + عدد روی زبانه سوابق) — بدون اعلان سیستمی و بدون هیچ مجوزی
  const notif = useNotif();
  const notifRef = useRef(notif);
  notifRef.current = notif;

  // اسکرول به بالا هنگام تغییر صفحه
  useEffect(() => { window.scrollTo(0, 0); notifRef.current.setOpen(false); }, [route]);

  // مهاجرت نسخه ۱.۶.۰: در اولین اجرا تنظیمات «ساختمان» از واحدهای جدیدترین قبض ساخته می‌شود
  useEffect(() => { buildingRepository.get().catch(() => undefined); }, []);
  useEffect(() => { void billRepository.warm().catch(() => undefined); }, []);

  // اجرای اول بعد از نصب: آموزش یک‌بار خودکار نمایش داده می‌شود (پرچم ماندگار؛ بازیابی پشتیبان آن را دوباره فعال نمی‌کند)
  useEffect(() => {
    let alive = true;
    onboardingRepository.consumeFirstRun().then((first) => {
      if (alive && first) setStack((s) => (s.length === 1 && s[0].name === 'home' ? [...s, { name: 'tutorial', topic: QUICK_TOPIC }] : s));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const openSupport = () => { if (route.name !== 'support') push({ name: 'support' }); };
  const openTopic = (topic: string) => push({ name: 'tutorial', topic });

  const startNewBill = async () => {
    const now = currentJalali();
    const todayKey = formatJalaliKey(todayJalali());
    const state = await periodsRepository.getState().catch(() => null);
    const blockers = newBillBlockers({
      mgmtEnabled: state?.mgmtEnabled ?? false,
      periods: state?.periods ?? [],
      todayKey,
    });
    if (blockers.length) {
      // فقط ناوبری؛ هرگز کلید مدیر یا تنظیمات را عوض نکن
      showErrors(blockers, [
        { label: 'رفتن به «مدیر ساختمان»', onClick: () => push({ name: 'periods', tab: 'manager' }) },
        {
          label: 'مدیر جدید',
          onClick: () => {
            // اگر کلید خاموش باشد فقط زبانهٔ مدیر را باز کن (فرم وقتی کلید روشن است معنا دارد)
            void periodsRepository.getState().then((s) => {
              push({ name: 'periods', tab: 'manager', openNewManager: !!s?.mgmtEnabled });
            }).catch(() => push({ name: 'periods', tab: 'manager' }));
          },
        },
      ]);
      return;
    }
    // واحدها (تعداد، اسم مستعار و نفرات پیش‌فرض) از تنظیمات «ساختمان» وارد می‌شوند
    const building = await buildingRepository.get().catch(() => null);
    const year = defaultBillYear(state?.currentYear ?? now.year);
    setDraft(emptyDraft(year, now.month, building));
    push({ name: 'newBill' });
  };

  /** دکمهٔ «باز کردن …» پایین موضوع‌های آموزش */
  const openTarget = (t: HelpTarget) => {
    if (t.kind === 'home') { setStack([{ name: 'home' }]); return; }
    if (t.kind === 'newBill') { void startNewBill(); return; }
    if (t.kind === 'settings' && t.section) setAccordionOpen(t.section, true);
    push(routeForTarget(t));
  };

  const onTab = (t: TabId) => {
    if (t === 'home') setStack([{ name: 'home' }]);
    else resetTo({ name: t });
  };

  // صفحه ورود (حدود ۱٫۸ ثانیه) و سپس خانه
  if (showIntro || !loaded) {
    return <IntroScreen onDone={() => setShowIntro(false)} />;
  }

  const showNav = TAB_ROUTES.includes(route.name);
  let screen: ReactNode = null;

  switch (route.name) {
    case 'home':
      screen = (
        <HomeScreen
          onNewBill={startNewBill}
          onOpen={(t) => push({ name: t })}
          alerts={notif.visible}
          mode={notif.mode}
          onShowAll={() => notif.setOpen(true)}
          onOpenBill={(billId) => push({ name: 'details', billId })}
          onDismiss={notif.dismissBanner}
          onSupport={openSupport}
        />
      );
      break;
    case 'newBill':
      screen = draft && (
        <NewBillScreen
          draft={draft}
          setDraft={setDraft}
          onBack={back}
          onCalculated={() => push({ name: 'result' })}
        />
      );
      break;
    case 'result':
      screen = draft && (
        <ResultScreen
          draft={draft}
          setDraft={setDraft}
          onBack={back}
          onSaved={(saved) => {
            setDraft(null);
            // پس از ذخیره، به سوابق همان سال/ماه می‌رویم
            resetTo({ name: 'records', years: [saved.bill.year], months: [saved.bill.month] });
            setJustSaved(saved);
          }}
        />
      );
      break;
    case 'records':
      screen = (
        <RecordsScreen
          years={route.years}
          months={route.months}
          types={route.types}
          statuses={route.statuses}
          onFilterChange={(f) => replaceTop({ name: 'records', years: f.years, months: f.months, types: f.types, statuses: f.statuses })}
          onOpenBill={(billId) => push({ name: 'details', billId })}
          onBack={stack.length > 1 && stack[stack.length - 2].name === 'report' ? back : undefined}
          onSupport={openSupport}
        />
      );
      break;
    case 'report':
      screen = (
        <ReportsScreen
          tab={route.tab}
          year={route.year}
          type={route.type}
          onChange={(tab, year, type) => replaceTop({ name: 'report', tab, year, type })}
          onOpenReport={(id) => push({ name: 'report', tab: id })}
          onBack={back}
          onOpenMonth={(year, months) => push({ name: 'records', years: [year], months: Array.isArray(months) ? months : [months] })}
          onOpenBill={(billId) => push({ name: 'details', billId })}
          onOpenUnit={(unitNumber) => push({ name: 'unitHistory', unitNumber })}
          onPayUnit={(unitNumber) => push({ name: 'unitPay', unitNumber })}
          onSupport={openSupport}
        />
      );
      break;
    case 'unitHistory':
      screen = (
        <UnitHistoryScreen
          unitNumber={route.unitNumber}
          onBack={back}
          onOpenBill={(billId) => push({ name: 'details', billId })}
        />
      );
      break;
    case 'unitPay':
      screen = (
        <UnitPaymentScreen
          key={route.unitNumber}
          unitNumber={route.unitNumber}
          onBack={back}
          onOpenHistory={(unitNumber) => replaceTop({ name: 'unitHistory', unitNumber })}
        />
      );
      break;
    case 'details':
      screen = (
        <BillDetailsScreen
          key={route.billId}
          billId={route.billId}
          onBack={back}
          onEdit={(d) => { setDraft(d); push({ name: 'newBill' }); }}
        />
      );
      break;
    case 'tutorial':
      screen = (
        <TutorialScreen
          topic={route.topic}
          onBack={back}
          onDone={() => setStack([{ name: 'home' }])}
          canGoBack={stack.length > 1}
          onPushTopic={openTopic}
          onReplaceTopic={(topic) => replaceTop({ name: 'tutorial', topic })}
          onOpenTarget={openTarget}
          onOpenSupport={openSupport}
        />
      );
      break;
    case 'support':
      screen = <SupportScreen key={route.tab ?? 'faq'} initialTab={route.tab} onBack={back} onOpenTopic={openTopic} />;
      break;
    case 'periods':
      screen = <PeriodsScreen tab={route.tab} openNewManager={route.openNewManager} onTab={(tab) => replaceTop({ name: 'periods', tab })} onBack={back} />;
      break;
    case 'meetings':
      screen = <MeetingsScreen onBack={back} />;
      break;
    case 'backup':
      screen = <BackupScreen onBack={back} />;
      break;
    case 'settings':
      screen = <SettingsScreen onBack={back} canGoBack={stack.length > 1} onSupport={openSupport} onOpenTopic={openTopic} focus={route.focus} />;
      break;
  }

  return (
    <div className={'app-shell' + (showNav ? ' has-nav' : '')}>
      {screen}
      {showNav && <BottomNav active={route.name as TabId} onSelect={onTab} badges={{ records: notif.all.length }} />}
      <BillSavedDialog saved={justSaved} onClose={() => setJustSaved(null)} />
      <NotificationsLayer onOpenBill={(billId) => push({ name: 'details', billId })} />
    </div>
  );
}
