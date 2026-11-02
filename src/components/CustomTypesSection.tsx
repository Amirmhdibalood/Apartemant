/**
 * «انواع قبض و روش‌ها» ← نوع‌های سفارشیِ ساختمان انتخاب‌شده (موکاپ تأییدشدهٔ ۱۰-a و ۱۰-b).
 * افزودن/ویرایش در برگهٔ پایین؛ حذف فقط وقتی هیچ قبضی (حتی حذف‌شده) از آن نوع نیست، وگرنه فقط خاموش.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useEntryPrefs } from '../context/EntryPrefsContext';
import { useTheme } from '../context/ThemeContext';
import { useFeedback } from '../context/FeedbackContext';
import {
  CUSTOM_COLORS, CUSTOM_ICON_IDS, CUSTOM_ICON_LABELS, MAX_CUSTOM_TYPES, TYPE_NAME_MAX, cleanTypeName, suggestIconColor,
  validateCustomType, type CustomBillType, type CustomColorId, type CustomIconId,
} from '../logic/billTypes';
import { toPersianDigits } from '../logic/formatting';
import { billTypeRepository, BillTypeError } from '../storage/billTypeRepository';
import { buildingRepository } from '../storage/buildingRepository';
import { DEFAULT_BUILDING_ID } from '../storage/sqlite/schema';
import { CustomTypeGlyph } from './CustomTypeIcons';
import { ExpenseIcon } from './ExpenseIcon';
import { Switch } from './Switch';
import { ConfirmDialog } from './ConfirmDialog';
import { IconCheck } from './Icons';

const Pencil = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" />
  </svg>
);
const Plus = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

interface Draft { id: CustomBillType['id'] | null; name: string; icon: CustomIconId; color: CustomColorId }

const swatch = (id: CustomColorId, dark: boolean) => {
  const c = CUSTOM_COLORS.find((x) => x.id === id) ?? CUSTOM_COLORS[0];
  return dark ? c.dark : c.color;
};

/** برگهٔ افزودن/ویرایش (۱۰-b) — بدون حالت داخلی جز ورودی‌ها؛ برای تست/نمایش هم مستقیم رندر می‌شود */
export function CustomTypeSheet({ draft, onChange, error, onSave, onCancel, busy, usage, onDelete }: {
  draft: Draft;
  onChange: (d: Draft) => void;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** فقط ویرایش: شمار قبض‌های این نوع (null = هنوز معلوم نیست) */
  usage?: number | null;
  onDelete?: () => void;
}) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const tc = swatch(draft.color, dark);
  const name = cleanTypeName(draft.name);
  return (
    <div className="dialog-backdrop ct-sheet-wrap" onClick={onCancel}>
      <div className="ct-sheet" role="dialog" aria-modal="true" aria-labelledby="ct-sheet-title" style={{ ['--tc' as string]: tc } as CSSProperties} onClick={(e) => e.stopPropagation()}>
        <div className="ct-sheet__grip" aria-hidden="true" />
        <h2 className="ct-sheet__title" id="ct-sheet-title">{draft.id ? 'ویرایش نوع قبض' : 'نوع قبض جدید'}</h2>
        <div className="ct-preview">
          <span className="expense-icon ct-icon" style={{ width: 44, height: 44 }}><CustomTypeGlyph icon={draft.icon} size={24} /></span>
          <span><b>{name || 'نام نوع قبض'}</b><small>پیش‌نمایش در فرم ثبت قبض و گزارش‌ها</small></span>
        </div>
        <label className="field ct-field">
          <span className="ct-label">نام نوع قبض <span className="ct-count">{toPersianDigits(draft.name.length)}/{toPersianDigits(TYPE_NAME_MAX)}</span></span>
          <input
            className="input"
            value={draft.name}
            maxLength={TYPE_NAME_MAX + 5}
            placeholder="مثلاً آسانسور"
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            aria-invalid={!!error}
          />
        </label>
        <span className="ct-label">نماد</span>
        <div className="ct-grid" role="radiogroup" aria-label="نماد">
          {CUSTOM_ICON_IDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={k === draft.icon} aria-label={CUSTOM_ICON_LABELS[k]}
              className={k === draft.icon ? 'is-on' : ''} onClick={() => onChange({ ...draft, icon: k })}>
              <CustomTypeGlyph icon={k} size={22} />
            </button>
          ))}
        </div>
        <span className="ct-label">رنگ</span>
        <div className="ct-colors" role="radiogroup" aria-label="رنگ">
          {CUSTOM_COLORS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={c.id === draft.color} aria-label={`رنگ ${c.id}`}
              className={c.id === draft.color ? 'is-on' : ''} style={{ ['--c' as string]: dark ? c.dark : c.color } as CSSProperties}
              onClick={() => onChange({ ...draft, color: c.id })}>
              {c.id === draft.color && <IconCheck size={16} strokeWidth={3} />}
            </button>
          ))}
        </div>
        {error && <p className="ct-error" role="alert">{error}</p>}
        <p className="ct-note">نحوهٔ تقسیم مثل بقیهٔ قبض‌ها هنگام ثبت قبض انتخاب می‌شود (بر اساس نفرات، واحد یا متراژ).</p>
        <div className="ct-actions">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={onSave}>ذخیره</button>
          <button type="button" className="btn btn--muted" onClick={onCancel}>انصراف</button>
        </div>
        {draft.id && usage != null && (
          usage === 0
            ? <button type="button" className="ct-delete" onClick={onDelete}>حذف این نوع قبض</button>
            : <p className="ct-used">در {toPersianDigits(usage)} قبض استفاده شده و حذف‌شدنی نیست؛ با کلید کنار نامش خاموشش کنید.</p>
        )}
      </div>
    </div>
  );
}

/** ردیف‌ها + دکمهٔ افزودن (۱۰-a). `buildingName` برای روشن بودن دامنه («این ساختمان») */
export function CustomTypesRows({ types, buildingName, onEdit, onAdd, onToggle }: {
  types: CustomBillType[];
  buildingName: string;
  onEdit: (t: CustomBillType) => void;
  onAdd: () => void;
  onToggle: (t: CustomBillType, on: boolean) => void;
}) {
  const full = types.length >= MAX_CUSTOM_TYPES;
  return (
    <div className="ct-section">
      <p className="ct-scope">نوع‌های سفارشی این ساختمان: <b>{buildingName}</b></p>
      {types.map((t) => (
        <div className="setting-row entry-prefs__row" key={t.id}>
          <label htmlFor={`sw-type-${t.id}`} className="setting-row__text entry-prefs__label">
            <ExpenseIcon type={t.id} size={26} />
            <span className="setting-row__label">{t.name}<span className="ct-badge">سفارشی</span></span>
          </label>
          <span className="ct-row-actions">
            <button type="button" className="ct-edit" aria-label={`ویرایش ${t.name}`} onClick={() => onEdit(t)}><Pencil /></button>
            <Switch id={`sw-type-${t.id}`} label={`نوع قبض ${t.name}`} checked={!t.hidden} onChange={(v) => onToggle(t, v)} />
          </span>
        </div>
      ))}
      <button type="button" className="ct-add" disabled={full} onClick={onAdd}><Plus />افزودن نوع قبض</button>
      <div className="ct-limit">
        {full ? `سقف ${toPersianDigits(MAX_CUSTOM_TYPES)} نوع سفارشی پر است؛ برای نوع تازه یکی را حذف کنید.` : `${toPersianDigits(types.length)} از ${toPersianDigits(MAX_CUSTOM_TYPES)} نوع سفارشی`}
      </div>
    </div>
  );
}

export function CustomTypesSection() {
  const entry = useEntryPrefs();
  const customTypes = entry.customTypes ?? [];
  const buildingId = entry.buildingId ?? DEFAULT_BUILDING_ID;
  const { setTypeOn } = entry;
  const { toast, showErrors } = useFeedback();
  const [buildingName, setBuildingName] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let alive = true;
    buildingRepository.getName(buildingId).then((n) => { if (alive) setBuildingName(n); }).catch(() => undefined);
    return () => { alive = false; };
  }, [buildingId]);

  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !confirmDelete) setDraft(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, confirmDelete]);

  const others = (d: Draft) => customTypes.filter((t) => t.id !== d.id);
  const liveError = (d: Draft) => validateCustomType(d, others(d), { isNew: !d.id });

  const open = (d: Draft) => { setDraft(d); setError(null); setTried(false); setUsage(null); };
  const onAdd = () => open({ id: null, name: '', ...suggestIconColor(customTypes) });
  const onEdit = (t: CustomBillType) => {
    open({ id: t.id, name: t.name, icon: t.icon, color: t.color });
    billTypeRepository.usage(buildingId, t.id).then(setUsage).catch(() => setUsage(null));
  };
  const onChange = (d: Draft) => { setDraft(d); if (tried) setError(liveError(d)); };

  const onSave = async () => {
    if (!draft) return;
    setTried(true);
    const err = liveError(draft);
    if (err) { setError(err); return; }
    setBusy(true);
    try {
      const input = { name: draft.name, icon: draft.icon, color: draft.color };
      if (draft.id) await billTypeRepository.update(buildingId, draft.id, input);
      else await billTypeRepository.add(buildingId, input);
      toast(draft.id ? 'نوع قبض ذخیره شد.' : `نوع قبض «${cleanTypeName(draft.name)}» اضافه شد.`);
      setDraft(null);
    } catch (e) {
      if (e instanceof BillTypeError) setError(e.message);
      else showErrors({ code: 'STORAGE_FAILED', message: 'ذخیره اطلاعات با مشکل مواجه شد. دوباره تلاش کنید.' });
    } finally {
      setBusy(false);
    }
  };

  const onDeleteConfirmed = async (ok: boolean) => {
    setConfirmDelete(false);
    if (!ok || !draft?.id) return;
    try {
      await billTypeRepository.remove(buildingId, draft.id);
      toast('نوع قبض حذف شد.');
      setDraft(null);
    } catch (e) {
      setError(e instanceof BillTypeError ? e.message : 'حذف با مشکل مواجه شد.');
    }
  };

  return (
    <>
      <CustomTypesRows types={customTypes} buildingName={buildingName} onAdd={onAdd} onEdit={onEdit} onToggle={(t, on) => setTypeOn(t.id, on)} />
      {draft && (
        <CustomTypeSheet
          draft={draft} onChange={onChange} error={error} busy={busy} usage={usage}
          onSave={() => void onSave()} onCancel={() => setDraft(null)} onDelete={() => setConfirmDelete(true)}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="حذف نوع قبض"
        text={`«${draft ? cleanTypeName(draft.name) : ''}» از این ساختمان حذف شود؟ هیچ قبضی از این نوع ثبت نشده است.`}
        confirmLabel="حذف"
        onResult={(ok) => void onDeleteConfirmed(ok)}
      />
    </>
  );
}
