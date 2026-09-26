/** منطق تسویه واحدها و قفل ویرایش */
import type { Unit } from '../models/types';

export function allSettled(units: Unit[]): boolean {
  return units.length > 0 && units.every((u) => u.isSettled);
}

export function settledCount(units: Unit[]): number {
  return units.filter((u) => u.isSettled).length;
}

/** آیا تغییر وضعیت این واحد باعث تسویه کامل قبض می‌شود؟ */
export function wouldCompleteSettlement(units: Unit[], unitId: string): boolean {
  return units.every((u) => (u.id === unitId ? true : u.isSettled)) && !units.find((u) => u.id === unitId)?.isSettled;
}
