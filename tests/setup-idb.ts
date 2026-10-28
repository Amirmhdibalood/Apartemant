import 'fake-indexeddb/auto';
import { vi } from 'vitest';

/** In-memory stand-in for @capacitor/preferences (Node / vitest). */
const prefs = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: prefs.has(key) ? prefs.get(key)! : null }),
    set: async ({ key, value }: { key: string; value: string }) => { prefs.set(key, value); },
    remove: async ({ key }: { key: string }) => { prefs.delete(key); },
    clear: async () => { prefs.clear(); },
    keys: async () => ({ keys: [...prefs.keys()] }),
  },
}));

/** Capacitor core: treat tests as non-native so SQLite uses memory/IDB file blob. */
vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>();
  return {
    ...actual,
    Capacitor: {
      ...actual.Capacitor,
      isNativePlatform: () => false,
      getPlatform: () => 'web',
    },
  };
});

/** Exposed for tests that seed legacy Preferences payloads. */
(globalThis as unknown as { __prefsMem: Map<string, string> }).__prefsMem = prefs;
