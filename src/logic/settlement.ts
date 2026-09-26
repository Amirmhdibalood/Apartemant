/** منطق تسویه واحدها و قفل ویرایش */
import type { Unit } from '../models/types';

export function allSettled(units: Unit[]): boolean {
  return units.length > 0 && units.every((u) => u.isSettled);
}

export function settledCount(units: Unit[]): number {
  return units.filter((u) => u.isSettled).length;
}
