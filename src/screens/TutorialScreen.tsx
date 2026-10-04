import { useMemo, useState, type ReactNode } from 'react';
import { AppHeader } from '../components/AppHeader';
import {
  IconBell, IconBook, IconChart, IconChevronLeft, IconGear, IconHeadset, IconPlus, IconSearch, IconShield, IconWallet,
} from '../components/Icons';
import { toPersianDigits } from '../logic/formatting';
import { QUICK_TOPIC, neighbours, searchTopics, topicById, topicsByGroup, type HelpGroupId, type HelpTarget, type HelpTopic } from '../logic/help';

const GROUP_ICON: Record<HelpGroupId, (p: { size?: number }) => ReactNode> = {
  start: IconBook, setup: IconGear, bill: IconPlus, pay: IconWallet, reports: IconChart, look: IconBell, data: IconShield,
};

interface Props {
  /** شناسهٔ موضوع؛ نبودن = فهرست موضوع‌ها */
  topic?: string;
  onBack: () => void;
  onDone: () => void;
  canGoBack: boolean;
  /** از فهرست به موضوع (روی پشته اضافه می‌شود) */
  onPushTopic: (id: string) => void;
  /** از موضوعی به موضوع دیگر / به فهرست (جایگزین صفحهٔ فعلی) */
  onReplaceTopic: (id: string | undefined) => void;
  onOpenTarget: (t: HelpTarget) => void;
  onOpenSupport: () => void;
}

/** آموزش (۱.۷.۷): فهرست موضوع‌ها با جست‌وجو + صفحهٔ هر موضوع. متن‌ها در `content/help.ts` است. */
export function TutorialScreen({ topic, onBack, onDone, canGoBack, onPushTopic, onReplaceTopic, onOpenTarget, onOpenSupport }: Props) {
  const t = topicById(topic);
  return (
    <>
      <AppHeader title="آموزش" onBack={canGoBack ? onBack : undefined} />
      <main className="screen screen--tutorial">
        {t ? (
          <TopicPage t={t} onDone={onDone} onReplaceTopic={onReplaceTopic} onOpenTarget={onOpenTarget} />
        ) : (
          <TopicList onPushTopic={onPushTopic} onOpenSupport={onOpenSupport} />
        )}
      </main>
    </>
  );
}

function TopicList({ onPushTopic, onOpenSupport }: { onPushTopic: (id: string) => void; onOpenSupport: () => void }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => topicsByGroup(), []);
  const found = useMemo(() => (q.trim() ? searchTopics(q) : null), [q]);
  const quick = topicById(QUICK_TOPIC);
  return (
    <>
      <label className="hp-search">
        <IconSearch size={20} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو در آموزش… مثلاً «متراژ» یا «لغو پرداخت»" aria-label="جست‌وجو در آموزش" enterKeyHint="search" />
      </label>

      {found ? (
        <>
          <div className="hp-gt"><span>نتیجهٔ جست‌وجو</span><span>{toPersianDigits(found.length)} موضوع</span></div>
          {found.length === 0 && <div className="empty-state"><p>موضوعی با این عبارت پیدا نشد. عبارت دیگری بنویسید.</p></div>}
          {found.length > 0 && <div className="hp-grp">{found.map((x) => <Row key={x.id} t={x} onOpen={onPushTopic} />)}</div>}
        </>
      ) : (
        <>
          {quick && (
            <div className="hp-quick">
              <b>{quick.title}</b>
              <small>اولین بار است؟ این پنج قدم کافی است.</small>
              <button type="button" className="btn btn--primary btn--block" onClick={() => onPushTopic(quick.id)}>شروع سریع (۱ دقیقه)</button>
            </div>
          )}
          {groups.map((g) => (
            <section key={g.id} aria-label={g.title}>
              <div className="hp-gt"><span>{g.title}</span><span>{toPersianDigits(g.topics.length)} موضوع</span></div>
              <div className="hp-grp">{g.topics.map((x) => <Row key={x.id} t={x} onOpen={onPushTopic} />)}</div>
            </section>
          ))}
        </>
      )}

      <button type="button" className="hp-sup" onClick={onOpenSupport}>
        <span className="sp-ic"><IconHeadset size={22} /></span>
        <span className="hp-sup__tx"><b>جواب‌تان را پیدا نکردید؟</b><small>به صفحهٔ «پشتیبانی» بروید: سؤال‌های رایج و راه‌های تماس.</small></span>
        <IconChevronLeft size={20} className="hp-ch" />
      </button>
    </>
  );
}

function Row({ t, onOpen }: { t: HelpTopic; onOpen: (id: string) => void }) {
  const Icon = GROUP_ICON[t.group];
  return (
    <button type="button" className="hp-row" onClick={() => onOpen(t.id)} data-topic={t.id}>
      <span className="hp-ic"><Icon size={20} /></span>
      <span className="hp-tx"><b>{t.title}{t.isNew && <span className="hp-new">جدید</span>}</b><small>{t.summary}</small></span>
      <IconChevronLeft size={20} className="hp-ch" />
    </button>
  );
}

function TopicPage({ t, onDone, onReplaceTopic, onOpenTarget }: { t: HelpTopic; onDone: () => void; onReplaceTopic: (id: string | undefined) => void; onOpenTarget: (x: HelpTarget) => void }) {
  const Icon = GROUP_ICON[t.group];
  const { prev, next } = neighbours(t.id);
  const related = t.related.map((id) => topicById(id)).filter((x): x is HelpTopic => !!x);
  const groupTitle = topicsByGroup().find((g) => g.id === t.group)?.title ?? '';
  return (
    <article className="hp-topic" data-topic={t.id}>
      <nav className="hp-crumb" aria-label="مسیر">
        <button type="button" onClick={() => onReplaceTopic(undefined)}>همهٔ موضوعات</button><span>‹</span><span>{groupTitle}</span>
      </nav>
      <div className="hp-hero">
        <span className="hp-ic"><Icon size={26} /></span>
        <h2>{t.title}{t.isNew && <span className="hp-new">جدید</span>}</h2>
      </div>

      <h3 className="hp-h">این بخش برای چیست؟</h3>
      <p className="hp-intro">{t.intro}</p>

      <h3 className="hp-h">قدم‌به‌قدم</h3>
      <ol className="steps">
        {t.steps.map((s, i) => (
          <li key={i} className="step">
            <span className="step__num">{toPersianDigits(i + 1)}</span>
            <span className="step__text">{s}</span>
          </li>
        ))}
      </ol>

      {t.tips?.map((x, i) => <div className="hp-tip" key={i}><b>نکته: </b>{x}</div>)}

      {t.qa && t.qa.length > 0 && (
        <>
          <h3 className="hp-h">پرسش‌های پرتکرار</h3>
          {t.qa.map((x, i) => <div className="hp-qa" key={i}><b>{x.q}</b>{x.a}</div>)}
        </>
      )}

      {t.open && <button type="button" className="btn btn--primary btn--block hp-open" onClick={() => onOpenTarget(t.open!.target)}>{t.open.label}</button>}
      {t.id === QUICK_TOPIC && <button type="button" className="btn btn--block hp-done" onClick={onDone}>متوجه شدم</button>}

      {related.length > 0 && (
        <>
          <h3 className="hp-h">موضوع‌های مرتبط</h3>
          <div className="hp-chips">{related.map((x) => <button type="button" key={x.id} onClick={() => onReplaceTopic(x.id)}>{x.title}</button>)}</div>
        </>
      )}

      <div className="hp-nav">
        {prev ? <button type="button" onClick={() => onReplaceTopic(prev.id)}><small>› موضوع قبلی</small>{prev.title}</button> : <span />}
        {next ? <button type="button" onClick={() => onReplaceTopic(next.id)}><small>موضوع بعدی ‹</small>{next.title}</button> : <span />}
      </div>
    </article>
  );
}
