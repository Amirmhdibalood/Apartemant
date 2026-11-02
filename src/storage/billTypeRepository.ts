/**
 * نوع‌های قبض سفارشی (SQLite، هر ساختمان جدا). هر تغییر رجیستری سراسری (logic/billTypes) را تازه می‌کند
 * تا برچسب/رنگ/نماد همه‌جا (فرم، فهرست‌ها، گزارش‌ها، PDF/تصویر) فوراً عوض شود.
 */
import type { CustomTypeId } from '../models/types';
import { withSqlite, withSqliteWrite } from './sqlite/db';
import {
  billTypeUsage, deleteBillTypeRow, ensureDefaultBuilding, insertBillType, readBillTypes, setBillTypeHidden, updateBillTypeRow,
} from './sqlite/domain';
import { ensureMigrationDone } from './migration';
import {
  cleanTypeName, newCustomTypeId, setCustomTypeRegistry, validateCustomType,
  type CustomBillType, type CustomTypeDraft,
} from '../logic/billTypes';

export class BillTypeError extends Error {}

async function readAll(): Promise<CustomBillType[]> {
  await ensureMigrationDone();
  return withSqlite((db) => { ensureDefaultBuilding(db); return readBillTypes(db); });
}

export const billTypeRepository = {
  /** بارگذاری دوباره رجیستری از دیتابیس (شروع برنامه، بعد از بازیابی) */
  async refresh(): Promise<CustomBillType[]> {
    const all = await readAll();
    setCustomTypeRegistry(all);
    return all;
  },

  async list(buildingId: string): Promise<CustomBillType[]> {
    await ensureMigrationDone();
    return withSqlite((db) => readBillTypes(db, buildingId));
  },

  async add(buildingId: string, draft: CustomTypeDraft): Promise<CustomBillType> {
    await ensureMigrationDone();
    const created = await withSqliteWrite((db) => {
      const others = readBillTypes(db, buildingId);
      const err = validateCustomType(draft, others, { isNew: true });
      if (err) throw new BillTypeError(err);
      const t: CustomBillType = {
        id: newCustomTypeId(), buildingId, name: cleanTypeName(draft.name), icon: draft.icon, color: draft.color,
        sortOrder: others.reduce((m, o) => Math.max(m, o.sortOrder + 1), 0), hidden: false, createdAt: new Date().toISOString(),
      };
      insertBillType(db, t);
      return t;
    });
    await this.refresh();
    return created;
  },

  /** تغییر نام/نماد/رنگ (روی همهٔ قبض‌های قبلی هم دیده می‌شود؛ قبض‌ها فقط شناسه را دارند) */
  async update(buildingId: string, id: CustomTypeId, draft: CustomTypeDraft): Promise<void> {
    await ensureMigrationDone();
    await withSqliteWrite((db) => {
      const all = readBillTypes(db, buildingId);
      if (!all.some((t) => t.id === id)) throw new BillTypeError('این نوع قبض پیدا نشد.');
      const err = validateCustomType(draft, all.filter((t) => t.id !== id), { isNew: false });
      if (err) throw new BillTypeError(err);
      updateBillTypeRow(db, { id, name: cleanTypeName(draft.name), icon: draft.icon, color: draft.color });
    });
    await this.refresh();
  },

  async setHidden(id: CustomTypeId, hidden: boolean): Promise<void> {
    await ensureMigrationDone();
    await withSqliteWrite((db) => setBillTypeHidden(db, id, hidden));
    await this.refresh();
  },

  /** شمار قبض‌های این نوع در ساختمان (حذف‌شده‌ها هم) */
  async usage(buildingId: string, id: CustomTypeId): Promise<number> {
    await ensureMigrationDone();
    return withSqlite((db) => billTypeUsage(db, buildingId, id));
  },

  /** حذف فقط وقتی هیچ قبضی (حتی حذف‌شده) از این نوع نیست؛ وگرنه فقط می‌شود خاموشش کرد */
  async remove(buildingId: string, id: CustomTypeId): Promise<void> {
    await ensureMigrationDone();
    await withSqliteWrite((db) => {
      if (billTypeUsage(db, buildingId, id) > 0) throw new BillTypeError('این نوع قبض در قبض‌های ثبت‌شده به کار رفته و حذف‌شدنی نیست؛ می‌توانید خاموشش کنید.');
      deleteBillTypeRow(db, buildingId, id);
    });
    await this.refresh();
  },
};
