/**
 * منطق آموزش (۱.۷.۷): فهرست موضوع‌ها، موضوعِ مرتبط با هر صفحه/بخش/پنجره، جست‌وجو و مقصدهای «باز کردن …».
 * محتوا در `content/help.ts` است؛ این‌جا فقط منطق خالص (قابل تست).
 */
import type { Route } from '../navigation';
import { HELP_GROUPS, HELP_TOPICS, type HelpGroupId, type HelpTarget, type HelpTopic } from '../content/help';
import { hasSupport } from './support';
import { SUPPORT, type SupportConfig } from '../config/support';

export { HELP_GROUPS };
export type { HelpTopic, HelpTarget, HelpGroupId };

/** شناسهٔ موضوع شروع سریع (اولین اجرا) */
export const QUICK_TOPIC = 'quick';
export const SUPPORT_TOPIC = 'support';

/** موضوع‌های قابل نمایش؛ تا وقتی پشتیبانی پر نشده، موضوع «پشتیبانی» پنهان است */
export function visibleTopics(cfg: SupportConfig = SUPPORT): HelpTopic[] {
  const sup = hasSupport(cfg);
  return HELP_TOPICS.filter((t) => t.id !== SUPPORT_TOPIC || sup);
}

export function topicById(id: string | undefined, cfg: SupportConfig = SUPPORT): HelpTopic | undefined {
  if (!id) return undefined;
  return visibleTopics(cfg).find((t) => t.id === id);
}

export function topicsByGroup(cfg: SupportConfig = SUPPORT): { id: HelpGroupId; title: string; topics: HelpTopic[] }[] {
  const all = visibleTopics(cfg);
  return HELP_GROUPS.map((g) => ({ ...g, topics: all.filter((t) => t.group === g.id) })).filter((g) => g.topics.length > 0);
}

/** قبلی/بعدی بر اساس ترتیب فهرست */
export function neighbours(id: string, cfg: SupportConfig = SUPPORT): { prev?: HelpTopic; next?: HelpTopic } {
  const all = visibleTopics(cfg);
  const i = all.findIndex((t) => t.id === id);
  if (i < 0) return {};
  return { prev: all[i - 1], next: all[i + 1] };
}

/** «؟»ی بالای هر صفحه: موضوع همان صفحه. undefined = فهرست */
export function helpTopicForRoute(route: Route): string | undefined {
  switch (route.name) {
    case 'home': return undefined;
    case 'newBill': return 'newbill';
    case 'result': return 'result';
    case 'details': return 'details';
    case 'records': return 'records';
    case 'unitHistory': return 'history';
    case 'unitPay': return 'debtpay';
    case 'settings': return 'settings';
    case 'tutorial': return undefined;
    case 'report':
      switch (route.tab) {
        case undefined: return 'reports';
        case 'yearly': return 'yearly';
        case 'monthly':
        case 'monthlyDetail': return 'monthly';
        case 'charts': return 'charts';
        case 'debtors': return 'debtors';
        case 'billPayments': return 'billpayments';
      }
  }
  return undefined;
}

/** بخش‌های آکاردئونی تنظیمات → موضوع */
export const ACCORDION_TOPIC: Record<string, string> = {
  years: 'years',
  building: 'building',
  'entry-prefs': 'prefs',
  'report-prefs': 'prefs',
  appearance: 'theme',
  warnings: 'warn',
  support: 'support',
  backup: 'backup',
};

/** پنجره‌ها و لایه‌ها → موضوع (آزمون همهٔ *Dialog.tsx را می‌پاید) */
export const DIALOG_TOPIC: Record<string, string> = {
  BillSavedDialog: 'image',
  WarningDialog: 'warn',
  LockedDialog: 'details',
  ConfirmDialog: 'details',
  ErrorDialog: 'newbill',
  PaymentDialog: 'unitpay',
  RestoreConfirmDialog: 'backup',
  NotificationsLayer: 'bell',
  ReportPreview: 'export',
};

/** مقصد دکمهٔ «باز کردن …» → مسیر */
export function routeForTarget(t: HelpTarget): Route {
  switch (t.kind) {
    case 'home': return { name: 'home' };
    case 'newBill': return { name: 'newBill' };
    case 'records': return { name: 'records' };
    case 'reports': return t.report ? { name: 'report', tab: t.report } : { name: 'report' };
    case 'settings': return t.section ? { name: 'settings', focus: t.section } : { name: 'settings' };
  }
}

// ───────────── جست‌وجو ─────────────
const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';
/** یکسان‌سازی برای جست‌وجو: ي/ك، ارقام، نیم‌فاصله و اعراب */
export function normalizeFa(s: string): string {
  return s
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[۰-۹٠-٩]/g, (d) => String(Math.max(FA.indexOf(d), AR.indexOf(d))))
    .replace(/[\u200c\u200f\u200e\u064b-\u065f\u0640]/g, '')
    .replace(/[‌_\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** امتیاز تطابق یک موضوع با عبارت (۰ = بی‌ربط) */
function score(t: HelpTopic, words: string[]): number {
  const title = normalizeFa(t.title);
  const summary = normalizeFa(t.summary);
  const kws = t.keywords.map(normalizeFa);
  const body = normalizeFa([t.intro, ...t.steps, ...(t.tips ?? []), ...(t.qa ?? []).flatMap((q) => [q.q, q.a])].join(' '));
  let total = 0;
  for (const w of words) {
    let s = 0;
    if (title.includes(w)) s = 10;
    else if (kws.some((k) => k.includes(w))) s = 7;
    else if (summary.includes(w)) s = 5;
    else if (body.includes(w)) s = 2;
    if (s === 0) return 0; // همهٔ کلمه‌ها باید جایی بیایند
    total += s;
  }
  return total;
}

export function searchTopics(query: string, cfg: SupportConfig = SUPPORT): HelpTopic[] {
  const q = normalizeFa(query);
  if (!q) return [];
  const words = q.split(' ').filter(Boolean);
  return visibleTopics(cfg)
    .map((t, i) => ({ t, s: score(t, words), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.t);
}
