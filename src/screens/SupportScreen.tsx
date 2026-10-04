import { useMemo, useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { IconChat, IconChevronLeft, IconHeadset, IconSearch } from '../components/Icons';
import { SupportContact } from '../components/SupportContact';
import { searchFaq } from '../logic/help';
import { hasSupport } from '../logic/support';
import { toPersianDigits } from '../logic/formatting';

type Tab = 'faq' | 'contact';

/** «پشتیبانی» (۱.۷.۷): زبانهٔ «سؤال‌های رایج» (از همان متن آموزش، جست‌وجوی آفلاین) + «تماس با ما» (از `config/support.ts`) */
export function SupportScreen({ initialTab = 'faq', onBack, onOpenTopic }: { initialTab?: Tab; onBack: () => void; onOpenTopic: (topicId: string) => void }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState('');
  const list = useMemo(() => searchFaq(q), [q]);
  const contact = hasSupport();

  return (
    <>
      <AppHeader title="پشتیبانی" onBack={onBack} />
      <main className="screen screen--support">
        <div className="seg" role="tablist" aria-label="پشتیبانی">
          <button type="button" role="tab" aria-selected={tab === 'faq'} className={'seg__btn' + (tab === 'faq' ? ' is-active' : '')} onClick={() => setTab('faq')}>سؤال‌های رایج</button>
          <button type="button" role="tab" aria-selected={tab === 'contact'} className={'seg__btn' + (tab === 'contact' ? ' is-active' : '')} onClick={() => setTab('contact')}>تماس با ما</button>
        </div>

        {tab === 'faq' && (
          <section aria-label="سؤال‌های رایج">
            <label className="hp-search">
              <IconSearch size={20} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو در سؤال‌ها… مثلاً «حذف» یا «قفل»" aria-label="جست‌وجو در سؤال‌ها" enterKeyHint="search" />
            </label>
            <div className="sp-head"><span>{q.trim() ? 'نتیجهٔ جست‌وجو' : 'پرسش‌های پرتکرار'}</span><span>{toPersianDigits(list.length)}{q.trim() ? ' مورد' : ' سؤال'}</span></div>
            {list.length === 0 && (
              <div className="empty-state"><p>سؤالی با این عبارت پیدا نشد. عبارت دیگری بنویسید یا فهرست «آموزش» را ببینید.</p></div>
            )}
            {list.map((f, i) => (
              <button type="button" className="sp-q" key={f.topicId + i} onClick={() => onOpenTopic(f.topicId)}>
                <span className="sp-q__tx"><b>{f.q}</b><p>{f.a}</p><small>آموزش کامل: {f.topicTitle}</small></span>
                <IconChevronLeft size={20} className="sp-q__ch" />
              </button>
            ))}
            <button type="button" className="sp-link" onClick={() => setTab('contact')}>
              <IconChat size={20} /><span>جواب‌تان را پیدا نکردید؟ به «تماس با ما» بروید.</span>
            </button>
          </section>
        )}

        {tab === 'contact' && (
          <section aria-label="تماس با ما">
            {contact ? (
              <div className="card sp-card">
                <p className="card__hint">سؤال یا مشکلی داشتید؟ از یکی از راه‌های زیر پیام بدهید. با زدن هر ردیف، برنامهٔ مربوط باز می‌شود؛ نگه داشتن انگشت روی ردیف یا دکمهٔ کنار آن، مقدار را کپی می‌کند.</p>
                <SupportContact />
                <p className="sp-note">برنامه اینترنت و مجوز ندارد؛ فقط لینک را به برنامهٔ ایمیل، شماره‌گیر، بله یا تلگرام شما می‌دهد. اگر آن برنامه نصب نباشد، مقدار را کپی کنید.</p>
              </div>
            ) : (
              <div className="card sp-soon">
                <span className="sp-ic"><IconHeadset size={30} /></span>
                <b>راه‌های تماس به‌زودی اضافه می‌شود</b>
                <p>فعلاً می‌توانید جواب خیلی از سؤال‌ها را در «سؤال‌های رایج» و بخش «آموزش» پیدا کنید.</p>
              </div>
            )}
            <button type="button" className="sp-link" onClick={() => setTab('faq')}>
              <IconSearch size={20} /><span>{contact ? 'قبل از پیام دادن، «سؤال‌های رایج» را ببینید.' : 'رفتن به «سؤال‌های رایج»'}</span>
            </button>
          </section>
        )}
      </main>
    </>
  );
}
