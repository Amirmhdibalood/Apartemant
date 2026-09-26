import { AppHeader } from '../components/AppHeader';

/** ۱۴. آموزش مرحله‌ای (۱۱ مرحله) */
export const TUTORIAL_STEPS: string[] = [
  'ماه و سال را انتخاب کنید.',
  'نوع هزینه را انتخاب کنید.',
  'شماره قبض و توضیحات را در صورت نیاز وارد کنید.',
  'واحدها را با دکمه + اضافه کنید (با دکمه − حذف می‌شوند).',
  'تعداد نفرات هر واحد را وارد کنید.',
  'مبلغ قبض را وارد کنید.',
  'دکمه «محاسبه و ادامه» را بزنید تا سهم هر واحد محاسبه شود.',
  'نتیجه را بررسی و اطلاعات را ذخیره کنید.',
  'قبض‌های ثبت‌شده را در «سوابق» بر اساس سال و ماه ببینید.',
  'بعد از پرداخت هر واحد، گزینه تسویه آن را در جزئیات قبض فعال کنید.',
  'پس از تسویه تمام واحدها، قبض دیگر قابل ویرایش نیست.',
];

export function TutorialScreen({ onBack, onDone, canGoBack }: { onBack: () => void; onDone: () => void; canGoBack: boolean }) {
  return (
    <>
      <AppHeader title="آموزش" onBack={canGoBack ? onBack : undefined} />
      <main className="screen screen--tutorial">
        <ol className="steps">
          {TUTORIAL_STEPS.map((s, i) => (
            <li key={i} className="step">
              <span className="step__num">{i + 1}</span>
              <span className="step__text">{s}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn--primary btn--block btn--lg steps__done" onClick={onDone}>متوجه شدم</button>
      </main>
    </>
  );
}
