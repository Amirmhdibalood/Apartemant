import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { HELP_GROUPS, HELP_TOPICS, type HelpTopic } from '../src/content/help';
import {
  ACCORDION_TOPIC, faqItems, helpTopicForRoute, neighbours, normalizeFa, routeForTarget, searchFaq, searchTopics, topicById, topicsByGroup, visibleTopics,
} from '../src/logic/help';
import { REPORTS } from '../src/logic/reportCatalog';
import type { Route } from '../src/navigation';
import { ALERT_DAYS_BEFORE } from '../src/logic/dueAlerts';

const WITH_SUPPORT = { email: 'a@b.ir', phone: '', bale: '', telegram: '' };
const NO_SUPPORT = { email: '', phone: '', bale: '', telegram: '' };

/** همهٔ متن‌های کاربرپسندِ یک موضوع */
const textsOf = (t: HelpTopic): string[] => [
  t.title, t.summary, t.intro, ...t.keywords, ...t.steps, ...(t.tips ?? []), ...(t.qa ?? []).flatMap((x) => [x.q, x.a]), t.open?.label ?? '',
];
const ALL = HELP_TOPICS.flatMap((t) => textsOf(t).map((text) => ({ id: t.id, text })));

describe('۱.۷.۷ — ساختار آموزش', () => {
  it('شناسه‌ها یکتا، گروه‌ها معتبر و ۴۰ موضوع (۱.۹: دوره‌ها، قفل قبض‌ها، فهرست‌های انتخاب)', () => {
    const ids = HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(40);
    const groups = HELP_GROUPS.map((g) => g.id);
    for (const t of HELP_TOPICS) expect(groups).toContain(t.group);
    for (const g of HELP_GROUPS) expect(HELP_TOPICS.some((t) => t.group === g.id)).toBe(true);
  });

  it('هر موضوع متن لازم دارد و از سقف طول‌ها بیرون نمی‌زند', () => {
    for (const t of HELP_TOPICS) {
      expect(t.title.length).toBeGreaterThan(2);
      expect(t.summary.length).toBeLessThanOrEqual(60);
      expect(t.keywords.length).toBeGreaterThanOrEqual(2);
      expect(t.intro.length).toBeLessThanOrEqual(320);
      expect(t.steps.length).toBeGreaterThanOrEqual(2);
      expect(t.steps.length).toBeLessThanOrEqual(7);
      for (const s of t.steps) expect(s.length).toBeLessThanOrEqual(260);
      for (const s of t.tips ?? []) expect(s.length).toBeLessThanOrEqual(260);
      for (const x of t.qa ?? []) { expect(x.q.length).toBeLessThanOrEqual(90); expect(x.a.length).toBeLessThanOrEqual(260); }
      const core = t.intro.length + t.steps.join('').length + (t.tips ?? []).join('').length;
      expect(core).toBeLessThanOrEqual(1500);
    }
  });

  it('مرجع‌ها معتبرند: related، open و جز تکراری نیستند', () => {
    const ids = new Set(HELP_TOPICS.map((t) => t.id));
    const sections = new Set(Object.keys(ACCORDION_TOPIC));
    const reportIds = new Set<string>(REPORTS.map((r) => r.id));
    for (const t of HELP_TOPICS) {
      for (const r of t.related) { expect(ids.has(r)).toBe(true); expect(r).not.toBe(t.id); }
      expect(new Set(t.related).size).toBe(t.related.length);
      if (t.open) {
        const g = t.open.target;
        if (g.kind === 'settings' && g.section) expect(sections.has(g.section)).toBe(true);
        if (g.kind === 'reports' && g.report) expect(reportIds.has(g.report)).toBe(true);
        expect(t.open.label.length).toBeGreaterThan(2);
      }
    }
  });

  it('حداقل ۲۵ سؤال رایج در موضوع‌ها هست و هیچ سؤالی تکراری نیست', () => {
    const q = HELP_TOPICS.flatMap((t) => (t.qa ?? []).map((x) => x.q));
    expect(q.length).toBeGreaterThanOrEqual(25);
    expect(new Set(q).size).toBe(q.length);
  });
});

describe('۱.۷.۷ — پوشش: هر صفحه، گزارش و بخش تنظیمات موضوع دارد', () => {
  const samples: Route[] = [
    { name: 'newBill' }, { name: 'result' }, { name: 'details', billId: 'x' }, { name: 'records' }, { name: 'unitHistory', unitNumber: 1 },
    { name: 'unitPay', unitNumber: 1 }, { name: 'settings' }, { name: 'support' }, { name: 'report' },
    { name: 'periods' }, { name: 'periods', tab: 'manager' }, { name: 'meetings' }, { name: 'backup' },
    ...REPORTS.map((r) => ({ name: 'report', tab: r.id }) as Route),
  ];
  it('helpTopicForRoute برای همهٔ مسیرها یک موضوع واقعی می‌دهد (خانه و آموزش = فهرست)', () => {
    expect(helpTopicForRoute({ name: 'home' })).toBeUndefined();
    expect(helpTopicForRoute({ name: 'tutorial' })).toBeUndefined();
    for (const r of samples) {
      const id = helpTopicForRoute(r);
      expect(id, JSON.stringify(r)).toBeTruthy();
      expect(HELP_TOPICS.some((t) => t.id === id)).toBe(true);
    }
  });
  it('نام‌های مسیر در navigation.ts همه پوشش داده می‌شوند', () => {
    const nav = readFileSync('src/navigation.ts', 'utf8');
    const names = [...nav.matchAll(/\{ name: '([A-Za-z]+)'/g)].map((m) => m[1]);
    const covered = new Set([...samples.map((r) => r.name), 'home', 'tutorial']);
    for (const n of new Set(names)) expect(covered.has(n as Route['name'])).toBe(true);
  });
  it('هر گزارش کاتالوگ موضوع دارد', () => {
    for (const r of REPORTS) expect(topicById(helpTopicForRoute({ name: 'report', tab: r.id }), WITH_SUPPORT)).toBeTruthy();
  });
  it('هر بخش آکاردئونی تنظیمات (از روی کد) به یک موضوع وصل است', () => {
    const src = readFileSync('src/screens/SettingsScreen.tsx', 'utf8');
    const ids = [...src.matchAll(/<Accordion id="([a-z-]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(7);
    for (const id of ids) expect(topicById(ACCORDION_TOPIC[id], WITH_SUPPORT), id).toBeTruthy();
    expect(ids).not.toContain('support'); // بخش پشتیبانی در تنظیمات نیست
  });
  it('مقصد باز کردن: مسیرها درست ساخته می‌شوند', () => {
    expect(routeForTarget({ kind: 'reports', report: 'debtors' })).toEqual({ name: 'report', tab: 'debtors' });
    expect(routeForTarget({ kind: 'settings', section: 'backup' })).toEqual({ name: 'settings', focus: 'backup' });
    expect(routeForTarget({ kind: 'support', tab: 'contact' })).toEqual({ name: 'support', tab: 'contact' });
    expect(routeForTarget({ kind: 'records' })).toEqual({ name: 'records' });
    expect(routeForTarget({ kind: 'periods', tab: 'manager' })).toEqual({ name: 'periods', tab: 'manager' });
    expect(routeForTarget({ kind: 'meetings' })).toEqual({ name: 'meetings' });
    expect(routeForTarget({ kind: 'backup' })).toEqual({ name: 'backup' });
  });
});

describe('۱.۷.۷ — موضوع «پشتیبانی» فقط وقتی راه تماس هست', () => {
  it('بدون مقدار پنهان است (فهرست، جست‌وجو، موضوع‌های همسایه)', () => {
    expect(visibleTopics(NO_SUPPORT).some((t) => t.id === 'support')).toBe(false);
    expect(topicById('support', NO_SUPPORT)).toBeUndefined();
    expect(searchTopics('پشتیبانی', NO_SUPPORT).some((t) => t.id === 'support')).toBe(false);
    expect(topicsByGroup(NO_SUPPORT).flatMap((g) => g.topics).some((t) => t.id === 'support')).toBe(false);
    expect(faqItems(NO_SUPPORT).some((f) => f.topicId === 'support')).toBe(false);
    for (const t of visibleTopics(NO_SUPPORT)) { const n = neighbours(t.id, NO_SUPPORT); expect(n.next?.id).not.toBe('support'); }
  });
  it('با دست‌کم یک مقدار دیده می‌شود', () => {
    expect(visibleTopics(WITH_SUPPORT).some((t) => t.id === 'support')).toBe(true);
    expect(searchTopics('پشتیبانی', WITH_SUPPORT)[0].id).toBe('support');
  });
});

describe('۱.۷.۷ — جست‌وجوی آفلاین', () => {
  it('«متراژ» موضوع متراژ را اول می‌آورد؛ ي/ك و ارقام و نیم‌فاصله یکسان‌اند', () => {
    expect(searchTopics('متراژ')[0].id).toBe('area');
    expect(searchTopics('متراژ').map((t) => t.id)).toContain('theme');
    expect(normalizeFa('پرداخت‌شدنِ ي ك ۱۲٣')).toBe('پرداختشدن ی ک 123');
    expect(searchTopics('چند ساختمان')[0].id).toBe('buildings');
    expect(searchTopics('ساختمان‌ها').map((t) => t.id)).toContain('buildings');
    expect(searchTopics('بدهکاران').map((t) => t.id)).toContain('debtors');
    expect(searchTopics('پشتیبانی').map((t) => t.id)).toContain('home');
    expect(searchTopics('   ')).toEqual([]);
    expect(searchTopics('zzzzqq')).toEqual([]);
  });
  it('همهٔ کلمه‌ها باید جایی بیایند', () => {
    expect(searchTopics('متراژ لغو').length).toBeLessThanOrEqual(searchTopics('متراژ').length);
  });
  it('سؤال‌های رایج از همان متن موضوع‌ها می‌آیند و جست‌وجو می‌شوند', () => {
    const all = faqItems();
    // ۱.۸.۰: ربات تلگرام پشتیبانی پر است، پس موضوع «پشتیبانی» هم در سؤال‌های رایج پیش‌فرض هست
    expect(all.length).toBe(HELP_TOPICS.flatMap((t) => t.qa ?? []).length);
    expect(faqItems(NO_SUPPORT).length).toBe(HELP_TOPICS.filter((t) => t.id !== 'support').flatMap((t) => t.qa ?? []).length);
    expect(searchFaq('').length).toBe(all.length);
    const hit = searchFaq('قفل');
    expect(hit.length).toBeGreaterThan(0);
    expect(searchFaq('حذف').every((f) => normalizeFa(f.q + f.a + f.topicTitle).includes('حذف'))).toBe(true);
    for (const f of all) expect(topicById(f.topicId)).toBeTruthy();
    expect(searchFaq('zzzzqq')).toEqual([]);
  });
});

describe('۱.۷.۷ — قاعدهٔ محتوا: آموزش فقط «طرز استفاده» است، نه فرمول و روش محاسبه', () => {
  const BAD: [string, RegExp][] = [
    ['علامت ریاضی × ÷ =', /[×÷=]/],
    ['«فرمول»', /فرمول/],
    ['«ضرب در»', /ضرب\s*در|ضرب\s*می|ضربدر/],
    ['«تقسیم بر» به معنی محاسبه (روش «بر اساس …» مجاز است)', /تقسیم\s*بر(?!\s*اساس)/],
    ['عدد پولی (۳٬۰۰۰٬۰۰۰ یا 3,000,000)', /[\d۰-۹]{1,3}[٬,][\d۰-۹]{3}/],
    ['عدد بزرگ بدون جداکننده (۴ رقم و بیشتر، مثل مبلغ نمونه)', /(?<![\d۰-۹A-Za-z])[\d۰-۹]{5,}(?![\d۰-۹])/],
    ['عملگر بین دو عدد', /[\d۰-۹]\s*[+−*/÷×]\s*[\d۰-۹]/],
    ['«قدیمی‌ترین» / «بزرگ‌ترین باقیمانده» (منطق تخصیص)', /قدیمی‌?ترین|بزرگ‌?ترین\s*باقی/],
    ['«گرد» به معنی گرد کردن مبلغ', /(^|\s)گرد(\s*(کن|می|شو|شد)|\s|$)|گردکردن|رُند|رند کردن|اعشار\s*(را|می)/],
    ['مثال محاسبه‌ای', /مثال\s*(عددی|محاسب)|محاسبهٔ\s*نمونه/],
    ['«مبلغ هر مترمربع» / «سهم هر … برابر است»', /قیمت\s*هر\s*متر|برابر\s*است\s*با|مساوی\s*است/],
  ];
  it('هیچ متنی الگوی فرمول یا محاسبه ندارد', () => {
    for (const [what, re] of BAD) {
      const bad = ALL.filter((x) => re.test(x.text)).map((x) => `${x.id}: ${x.text.slice(0, 60)}`);
      expect(bad, what).toEqual([]);
    }
  });
  it('روش‌های «بر اساس نفرات/واحد/متراژ» فقط با نام آمده‌اند (مجاز)', () => {
    const area = HELP_TOPICS.find((t) => t.id === 'area')!;
    expect(area.title).toContain('تقسیم بر اساس متراژ');
  });
  it('نویسهٔ خراب ندارد و متن مهلت «از ۲ روز قبل» (هم‌خوان با ALERT_DAYS_BEFORE) است', () => {
    expect(ALERT_DAYS_BEFORE).toBe(2);
    for (const x of ALL) expect(x.text).not.toContain('\uFFFD');
    const joined = ALL.map((x) => x.text).join(' ');
    expect(joined).toContain('از ۲ روز قبل');
    expect(joined).not.toContain('از یک روز قبل');
  });
  it('خودِ آزمون الگوها را درست تشخیص می‌دهد (نمونهٔ بد گرفته می‌شود)', () => {
    const samples = ['سهم = متراژ × قیمت', 'عدد را ضرب در ۲ کنید', 'تقسیم بر تعداد نفرات', 'فرمول سهم', '۳٬۰۰۰٬۰۰۰ تومان', 'مبلغ ۱۰۰۰۰۰ تومان', '۱۰ + ۲۰', 'از قدیمی‌ترین قبض کم می‌شود', 'مبلغ گرد می‌شود'];
    for (const s of samples) expect(BAD.some(([, re]) => re.test(s)), s).toBe(true);
    for (const ok of ['تقسیم بر اساس متراژ', 'نحوه تقسیم', 'سال ۱۴۰۵', 'بر اساس نفرات', 'برگرداندن به پرداخت‌نشده']) expect(BAD.some(([, re]) => re.test(ok)), ok).toBe(false);
  });
  it('کد رابط (فهرست/موضوع/پشتیبانی) هم متن محاسباتی ثابت ندارد', () => {
    for (const f of ['src/screens/TutorialScreen.tsx', 'src/screens/SupportScreen.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/فرمول|ضرب\s*در|تقسیم\s*بر(?!\s*اساس)/);
    }
  });
});

describe('۱.۷.۸ — نام دکمه‌ها در همهٔ متن‌ها', () => {
  const texts = (): string[] => {
    const out: string[] = [];
    for (const t of HELP_TOPICS) {
      out.push(t.title, t.summary, t.intro, ...t.steps, ...(t.tips ?? []), ...(t.qa ?? []).flatMap((x) => [x.q, x.a]), t.open?.label ?? '');
    }
    for (const f of faqItems(WITH_SUPPORT)) out.push(f.q, f.a);
    return out.filter(Boolean);
  };
  const uiSource = (): string[] => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const f = `${d}/${e.name}`;
        if (e.isDirectory()) walk(f);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          for (const line of readFileSync(f, 'utf8').split('\n')) {
            const t = line.trim();
            if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) continue;
            out.push(line.replace(/\s\/\/.*$/, ''));
          }
        }
      }
    };
    walk('src');
    return out;
  };
  const BTN_Q = /«\s*؟\s*»|دکمهٔ\s*؟|دکمه\s*؟|آیکن\s*؟|آیکون\s*؟|علامت\s*(سؤال|سوال)/;
  it('هیچ متنی «؟» را به‌عنوان دکمه نام نمی‌برد (آموزش از صفحهٔ اصلی است)', () => {
    for (const x of texts()) expect(x).not.toMatch(BTN_Q);
    for (const x of uiSource()) expect(x).not.toMatch(BTN_Q);
  });
  it('«هدست» نام دکمه نیست؛ پشتیبانی همان «پشتیبانی» است', () => {
    for (const x of [...texts(), ...uiSource()]) expect(x).not.toMatch(/هدست/);
    for (const t of HELP_TOPICS) expect(t.keywords.join(' ')).not.toMatch(/هدست|راهنما/);
  });
  it('هر جا زنگوله آمده، به‌صورت «زنگوله (اعلان)» است', () => {
    for (const x of texts()) expect(x).not.toMatch(/زنگوله(?! \(اعلان\))/);
    for (const x of uiSource().filter((l) => !/keywords:/.test(l))) if (/'[^']*زنگوله|"[^"]*زنگوله|>[^<]*زنگوله/.test(x)) expect(x).not.toMatch(/زنگوله(?! \(اعلان\))/);
  });
  it('دکمهٔ تم همیشه «تم» (ماه یا خورشید) نامیده می‌شود، نه «ماه یا خورشید» تنها', () => {
    for (const x of texts()) {
      if (/ماه\s*(یا|\/)\s*خورشید/.test(x)) expect(x).toMatch(/«تم» \(ماه یا خورشید\)/);
    }
  });
  it('آموزش از خانه: مرحلهٔ «آموزش» و «راهنمای این بخش» در موضوع خانه هست', () => {
    const home = topicById('home')!;
    expect(home.steps.join(' ')).toMatch(/دکمهٔ «آموزش»/);
    expect(home.steps.join(' ')).toMatch(/راهنمای این بخش/);
    expect(home.steps.join(' ')).toMatch(/دکمهٔ «پشتیبانی»/);
  });
});

describe('۱.۹.۰ — آموزش و سؤال‌های رایج برای دوره‌ها، قفل، صفحهٔ اصلی و فیلترهای چندتایی', () => {
  const joined = () => ALL.map((x) => x.text).join('\n');
  it('مسیرهای قدیمی تنظیمات (سال‌ها، دورهٔ مدیریت، جلسه) دیگر در متن‌ها نیست', () => {
    for (const bad of ['تنظیمات ← سال‌ها', 'تنظیمات ← دورهٔ مدیریت', 'تنظیمات ← جلسه', 'سال‌های فعال تنظیمات', 'سال مالی']) expect(joined(), bad).not.toContain(bad);
  });
  it('هیچ‌جای برنامه واژهٔ ممنوعِ «دوره + مالی» نیست (متن، کد، نام‌گذاری)', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
    for (const f of walk('src').filter((x) => /\.(ts|tsx|css)$/.test(x))) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(new RegExp(['دور[هة]\\s*[\u0654]?[\u200c\\s]*(ی\\s*)?' + 'مالی', 'fiscal', 'financialYear'].join('|'), 'i'));
    }
  });
  it('موضوع‌های تازه و جابه‌جاشده مقصد درست دارند', () => {
    expect(topicById('periods')?.open?.target).toEqual({ kind: 'periods' });
    expect(topicById('years')?.open?.target).toEqual({ kind: 'periods', tab: 'years' });
    expect(topicById('management')?.open?.target).toEqual({ kind: 'periods', tab: 'manager' });
    expect(topicById('meetings')?.open?.target).toEqual({ kind: 'meetings' });
    expect(topicById('backup')?.open?.target).toEqual({ kind: 'backup' });
    expect(helpTopicForRoute({ name: 'periods', tab: 'manager' })).toBe('management');
    expect(helpTopicForRoute({ name: 'periods' })).toBe('years');
  });
  it('تاریخ شروع و پایان سال، قفل، نوار پایین و انتخاب چندتایی توضیح داده شده‌اند', () => {
    const years = textsOf(topicById('years')!).join(' ');
    expect(years).toContain('۱ فروردین');
    expect(years).toMatch(/آخرین روز اسفند/);
    expect(years).toMatch(/۳۰/);
    const home = topicById('home')!.steps.join(' ');
    expect(home).toMatch(/«سوابق»، «گزارش‌ها»، «خانه» \(دکمهٔ وسط و برجسته\)، «آموزش» و «تنظیمات»/);
    for (const c of ['«دوره‌ها»', '«جلسه»', '«پشتیبان‌گیری»']) expect(home).toContain(c);
    const lock = textsOf(topicById('lock')!).join(' ');
    for (const w of ['ویرایش', 'حذف', 'پرداخت شد', 'مهلت', 'لغو این پرداخت', 'پرداخت واحدها']) expect(lock).toContain(w);
    expect(textsOf(topicById('records')!).join(' ')).toContain('۲ ماه (مهر، آبان)');
    expect(textsOf(topicById('monthly')!).join(' ')).toMatch(/چند ماه/);
    expect(textsOf(topicById('pickers')!).join(' ')).toMatch(/روز، ماه و سال/);
  });
  it('سؤال‌های رایج تازه پیدا می‌شوند', () => {
    const faq = faqItems(WITH_SUPPORT).map((x) => x.q);
    for (const q of ['صفحهٔ «دوره‌ها» کجاست؟', 'چرا قبضم قفل شده؟', 'سال پارسال را در گزارش‌ها پیدا نمی‌کنم.', 'چرا سال جاری دکمهٔ «پنهان کن» ندارد؟', 'می‌شود قبض‌های دو ماه را با هم دید؟', 'جمع دو یا سه ماه را با هم می‌خواهم.', 'تاریخ شروع و پایان سال را می‌شود عوض کرد؟', 'دکمه‌های «سوابق»، «گزارش‌ها» و «آموزش» از صفحهٔ اصلی کجا رفتند؟']) expect(faq, q).toContain(q);
    expect(searchFaq('قفل', WITH_SUPPORT).some((x) => x.topicId === 'lock')).toBe(true);
    expect(searchTopics('سال‌های پنهان', WITH_SUPPORT)[0]?.id).toBe('years');
    expect(searchTopics('افزودن سال', WITH_SUPPORT)[0]?.id).toBe('years');
    expect(searchTopics('مدیر ساختمان', WITH_SUPPORT)[0]?.id).toBe('management');
  });
});
