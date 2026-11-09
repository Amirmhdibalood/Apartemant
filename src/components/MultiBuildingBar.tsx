import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { buildingRepository, type BuildingRow } from '../storage/buildingRepository';
import { useFeedback } from '../context/FeedbackContext';
import { DEFAULT_BUILDING_ID } from '../storage/sqlite/schema';
import { Errors } from '../logic/errors';
import { toPersianDigits } from '../logic/formatting';
import { IconCheck, IconChevronDown } from './Icons';
import { Popover } from './Popover';
import { Dialog } from './Dialog';

/**
 * فهرست ساختمان‌ها وقتی سوییچ «چندساختمانی» روشن است.
 * انتخاب ساختمان فعال + «ویرایش» کنار هر ردیف؛ بایگانی‌شده‌ها در بخش جمع‌شده پایین.
 */
export function MultiBuildingBar({ reloadKey = 0, onBuildingChange }: { reloadKey?: number; onBuildingChange?: () => void }) {
  const { toast, showErrors, confirmDanger } = useFeedback();
  const [multi, setMulti] = useState(false);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [archived, setArchived] = useState<BuildingRow[]>([]);
  const [activeId, setActiveId] = useState(DEFAULT_BUILDING_ID);
  const [newName, setNewName] = useState('');
  const [open, setOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [edit, setEdit] = useState<BuildingRow | null>(null);
  const [editName, setEditName] = useState('');
  const listId = useId();
  const anchorRef = useRef<HTMLButtonElement>(null);

  const reload = useCallback(async () => {
    const [m, list, arch, active] = await Promise.all([
      buildingRepository.isMultiEnabled(),
      buildingRepository.list(),
      buildingRepository.listArchived(),
      buildingRepository.getActiveId(),
    ]);
    setMulti(m);
    setBuildings(list);
    setArchived(arch);
    setActiveId(active);
  }, []);

  useEffect(() => { void reload().catch(() => undefined); }, [reload, reloadKey]);
  useEffect(() => buildingRepository.onActiveChange(() => { void reload(); onBuildingChange?.(); }), [reload, onBuildingChange]);

  if (!multi) return null;

  const active = buildings.find((b) => b.id === activeId);
  const fmt = (s: string) => toPersianDigits(s);

  const select = async (id: string) => {
    await buildingRepository.setActiveId(id);
    setActiveId(id);
    setOpen(false);
    onBuildingChange?.();
  };

  const add = async () => {
    const name = newName.trim() || `ساختمان ${toPersianDigits(buildings.length + 1)}`;
    try {
      const id = await buildingRepository.create(name, true);
      setNewName('');
      await buildingRepository.setActiveId(id);
      toast('ساختمان جدید ساخته شد.');
      await reload();
      onBuildingChange?.();
    } catch {
      showErrors(Errors.storageFailed());
    }
  };

  const openEdit = (b: BuildingRow) => {
    setEdit(b);
    setEditName(b.name);
    setOpen(false);
  };

  const saveEdit = async () => {
    if (!edit) return;
    const name = editName.replace(/\s+/g, ' ').trim();
    if (!name) { showErrors(Errors.backupInvalid('نام ساختمان را بنویسید.')); return; }
    await buildingRepository.rename(edit.id, name);
    toast('نام ساختمان ذخیره شد.');
    setEdit(null);
    await reload();
    onBuildingChange?.();
  };

  const archiveEdit = async () => {
    if (!edit) return;
    if (edit.id === DEFAULT_BUILDING_ID) {
      showErrors(Errors.backupInvalid('ساختمان پیش‌فرض را نمی‌توان بایگانی کرد.'));
      return;
    }
    if (!(await confirmDanger({
      title: 'بایگانی ساختمان',
      text: 'ساختمان از فهرست فعال کنار می‌رود؛ قبض‌هایش در پایگاه می‌مانند. ادامه؟',
      confirmLabel: 'بایگانی',
    }))) return;
    await buildingRepository.archive(edit.id);
    toast('ساختمان بایگانی شد.');
    setEdit(null);
    await reload();
    onBuildingChange?.();
  };

  const restore = async (id: string) => {
    await buildingRepository.unarchive(id);
    toast('ساختمان بازگردانی شد.');
    await reload();
    onBuildingChange?.();
  };

  return (
    <div className="multi-building">
      <div className={'year-picker option-picker' + (open ? ' is-open' : '')}>
        <button
          ref={anchorRef}
          type="button"
          id="building-active-picker"
          className="year-picker__toggle"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-label={`ساختمان فعال: ${active?.name ?? ''}`}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="year-picker__text">
            <span className="year-picker__label">ساختمان فعال</span>
            <span className="year-picker__value">{fmt(active?.name ?? '—')}</span>
          </span>
          <IconChevronDown size={22} className="year-picker__chevron" />
        </button>
        <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} id={listId} role="radiogroup" ariaLabel="ساختمان فعال" minWidth={220}>
          {buildings.map((b) => {
            const on = b.id === activeId;
            return (
              <div key={b.id} className={'year-row building-pick-row' + (on ? ' is-active' : '')}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className="building-pick-row__main"
                  onClick={() => { void select(b.id); }}
                >
                  <span className="year-row__box" aria-hidden="true">{on && <IconCheck size={15} strokeWidth={3} />}</span>
                  <span className="year-row__year">{fmt(b.name)}</span>
                </button>
                <button type="button" className="btn btn--ghost btn--sm building-pick-row__edit" onClick={() => openEdit(b)}>
                  ویرایش
                </button>
              </div>
            );
          })}
        </Popover>
      </div>

      <div className="multi-building__add">
        <input
          className="input"
          value={newName}
          onChange={(e) => setNewName(e.target.value.slice(0, 80))}
          placeholder="نام ساختمان جدید"
          aria-label="نام ساختمان جدید"
        />
        <button type="button" className="btn btn--primary" onClick={() => void add()}>افزودن</button>
      </div>

      {archived.length > 0 && (
        <div className={'hidden-years' + (archivedOpen ? ' is-open' : '')}>
          <button type="button" className="hidden-years__head" aria-expanded={archivedOpen} onClick={() => setArchivedOpen((v) => !v)}>
            <strong>ساختمان‌های بایگانی‌شده ({toPersianDigits(archived.length)})</strong>
            <IconChevronDown size={20} className="hidden-years__chev" />
          </button>
          {archivedOpen && (
            <ul className="period-list hidden-years__list">
              {archived.map((b) => (
                <li key={b.id} className="period-card">
                  <div className="period-card__body">
                    <div className="period-card__title"><strong>{fmt(b.name)}</strong></div>
                  </div>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => void restore(b.id)}>بازگردانی</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="card__hint">واحدها، قبض‌ها، صندوق و مدیر ساختمان مربوط به ساختمانی است که اینجا انتخاب می‌کنید.</p>

      <Dialog open={!!edit} onClose={() => setEdit(null)} labelledBy="building-edit-title">
        <h2 id="building-edit-title" className="dialog__title">ویرایش ساختمان</h2>
        <label className="field">
          <span className="field__label">نام ساختمان</span>
          <input className="input" value={editName} maxLength={80} onChange={(e) => setEditName(e.target.value)} autoFocus />
        </label>
        <div className="dialog__actions dialog__actions--stack">
          <button type="button" className="btn btn--primary btn--block" onClick={() => void saveEdit()}>ذخیره نام</button>
          {edit && edit.id !== DEFAULT_BUILDING_ID && (
            <button type="button" className="btn btn--danger-soft btn--block" onClick={() => void archiveEdit()}>بایگانی ساختمان</button>
          )}
          <button type="button" className="btn btn--muted btn--block" onClick={() => setEdit(null)}>انصراف</button>
        </div>
      </Dialog>
    </div>
  );
}
