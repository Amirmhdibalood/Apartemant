/**
 * Active building + multi-building toggle (Preferences).
 * Domain rows live in SQLite; this only remembers which building the UI is focused on.
 */
import { readJson, writeJson } from './kvStore';
import { DEFAULT_BUILDING_ID } from './sqlite/schema';

const MULTI_KEY = 'multiBuildingEnabled';
const ACTIVE_KEY = 'activeBuildingId';

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
}

export const activeBuildingStore = {
  async isMultiEnabled(): Promise<boolean> {
    return (await readJson<boolean | null>(MULTI_KEY, null)) === true;
  },

  async setMultiEnabled(on: boolean): Promise<void> {
    await writeJson(MULTI_KEY, on);
    notify();
  },

  async getActiveId(): Promise<string> {
    const id = await readJson<string | null>(ACTIVE_KEY, null);
    return id && id.length > 0 ? id : DEFAULT_BUILDING_ID;
  },

  async setActiveId(id: string): Promise<void> {
    await writeJson(ACTIVE_KEY, id || DEFAULT_BUILDING_ID);
    notify();
  },

  onChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
