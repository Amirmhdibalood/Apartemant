import { AppHeader } from '../components/AppHeader';
import { BackupSection } from '../components/BackupSection';

/** «پشتیبان‌گیری» (۱.۹): کارت صفحهٔ اصلی؛ همان بخش «تنظیمات ← پشتیبان‌گیری و بازیابی» */
export function BackupScreen({ onBack }: { onBack: () => void }) {
  return (
    <>
      <AppHeader title="پشتیبان‌گیری و بازیابی" onBack={onBack} />
      <main className="screen screen--backup">
        <div className="card">
          <BackupSection />
        </div>
      </main>
    </>
  );
}
