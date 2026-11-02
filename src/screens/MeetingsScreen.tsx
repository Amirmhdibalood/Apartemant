import { AppHeader } from '../components/AppHeader';
import { MeetingsSection } from '../components/MeetingsSection';

/** «جلسه» (۱.۹): از تنظیمات به کارت صفحهٔ اصلی آمد؛ همان ثبت جلسه، حضور و غیاب و خلاصه برای ساختمان فعال */
export function MeetingsScreen({ onBack }: { onBack: () => void }) {
  return (
    <>
      <AppHeader title="جلسه" onBack={onBack} />
      <main className="screen screen--meetings">
        <div className="card">
          <MeetingsSection />
        </div>
      </main>
    </>
  );
}
