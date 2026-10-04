import type { ReactElement } from 'react';
import { IconCalendar, IconChart, IconChevronLeft, IconList, IconPie, IconReceipt, IconUsers } from '../../components/Icons';
import { REPORT_GROUP_TITLE, type ReportGroup, type ReportId } from '../../logic/reportCatalog';
import { visibleReports, type ReportPrefs } from '../../logic/reportPrefs';

const ICONS: Record<ReportId, (p: { size?: number }) => ReactElement> = {
  yearly: IconChart, monthly: IconCalendar, monthlyDetail: IconList, charts: IconPie, debtors: IconUsers, billPayments: IconReceipt,
};

interface Props { prefs: ReportPrefs; onOpen: (id: ReportId) => void }

/** فهرست گزارش‌ها (مثل تنظیمات): هر ردیف آیکون، عنوان و توضیح کوتاه دارد و صفحهٔ جداگانهٔ همان گزارش را باز می‌کند */
export function ReportsHub({ prefs, onOpen }: Props) {
  const shown = visibleReports(prefs);
  const groups = (['costs', 'debts'] as ReportGroup[]).map((g) => ({ g, items: shown.filter((r) => r.group === g) })).filter((x) => x.items.length > 0);
  return (
    <>
      <p className="hub-intro">یک گزارش را انتخاب کنید؛ هر گزارش صفحهٔ جداگانهٔ خودش را دارد.</p>
      {groups.map(({ g, items }) => (
        <section key={g} aria-label={REPORT_GROUP_TITLE[g]}>
          <h2 className="hub-sec">{REPORT_GROUP_TITLE[g]}</h2>
          <div className="card hub-card">
            {items.map((r) => {
              const Icon = ICONS[r.id];
              return (
                <button key={r.id} type="button" className="hub-row" data-report={r.id} onClick={() => onOpen(r.id)}>
                  <span className="hub-ico"><Icon size={24} /></span>
                  <span className="hub-main">
                    <span className="hub-title">{r.title}{r.isNew && <span className="hub-new">جدید</span>}</span>
                    <span className="hub-desc">{r.desc}</span>
                  </span>
                  <IconChevronLeft size={20} className="hub-chev" />
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="hub-note">انواع قبضِ خاموش‌شده در تنظیمات، در هیچ‌کدام از گزارش‌ها حساب نمی‌شوند. گزارش‌های نمایش‌داده‌شده را از تنظیمات ← «نمایش گزارش‌ها» تغییر دهید.</p>
    </>
  );
}
