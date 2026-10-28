import { useCallback, useEffect, useState } from 'react';
import { buildingRepository, type BuildingRow } from '../storage/buildingRepository';
import { useFeedback } from '../context/FeedbackContext';
import { DEFAULT_BUILDING_ID } from '../storage/sqlite/schema';
import { Errors } from '../logic/errors';
import { toPersianDigits } from '../logic/formatting';

/**
 * فهرست ساختمان‌ها وقتی سوییچ «چند ساختمان» (روی عنوان آکاردئون) روشن است.
 * خودِ سوییچ اینجا نیست — کنار عنوان «ساختمان‌ها» در Settings است.
 */
export function MultiBuildingBar({ reloadKey = 0, onBuildingChange }: { reloadKey?: number; onBuildingChange?: () => void }) {
  const { toast, showErrors, confirmDanger } = useFeedback();
  const [multi, setMulti] = useState(false);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [activeId, setActiveId] = useState(DEFAULT_BUILDING_ID);
  const [newName, setNewName] = useState('');

  const reload = useCallback(async () => {
    const [m, list, active] = await Promise.all([
      buildingRepository.isMultiEnabled(),
      buildingRepository.list(),
      buildingRepository.getActiveId(),
    ]);
    setMulti(m);
    setBuildings(list);
    setActiveId(active);
  }, []);

  useEffect(() => { void reload().catch(() => undefined); }, [reload, reloadKey]);
  useEffect(() => buildingRepository.onActiveChange(() => { void reload(); onBuildingChange?.(); }), [reload, onBuildingChange]);

  if (!multi) return null;

  const select = async (id: string) => {
    await buildingRepository.setActiveId(id);
    setActiveId(id);
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

  const rename = async (id: string) => {
    const current = buildings.find((b) => b.id === id)?.name ?? '';
    const next = window.prompt('نام جدید ساختمان', current);
    if (next == null) return;
    await buildingRepository.rename(id, next);
    await reload();
  };

  const archive = async (id: string) => {
    if (id === DEFAULT_BUILDING_ID) {
      showErrors(Errors.backupInvalid('ساختمان پیش‌فرض را نمی‌توان حذف کرد.'));
      return;
    }
    if (!(await confirmDanger({
      title: 'بایگانی ساختمان',
      text: 'ساختمان از فهرست فعال کنار می‌رود؛ قبض‌هایش در پایگاه می‌مانند. ادامه؟',
      confirmLabel: 'بایگانی',
    }))) return;
    await buildingRepository.archive(id);
    toast('ساختمان بایگانی شد.');
    await reload();
    onBuildingChange?.();
  };

  return (
    <div className="multi-building">
      <div className="seg multi-building__seg" role="radiogroup" aria-label="ساختمان فعال">
        {buildings.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={activeId === b.id}
            className={'seg__btn' + (activeId === b.id ? ' is-active' : '')}
            onClick={() => void select(b.id)}
            onContextMenu={(e) => { e.preventDefault(); void rename(b.id); }}
          >
            {b.name}
          </button>
        ))}
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
      {activeId !== DEFAULT_BUILDING_ID && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void archive(activeId)}>
          بایگانی ساختمان فعال
        </button>
      )}
      <p className="card__hint">برای تغییر نام، روی نام ساختمان لمس طولانی / راست‌کلیک کنید.</p>
    </div>
  );
}
