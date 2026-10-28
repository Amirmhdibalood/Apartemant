import { describe, expect, it } from 'vitest';
import { STORE_LINKS, displayStoreLinks, shareableStoreLinks } from '../src/config/storeLinks';

describe('storeLinks', () => {
  it('exposes Myket URL and Bazaar as coming soon', () => {
    const myket = STORE_LINKS.find((l) => l.id === 'myket');
    const bazaar = STORE_LINKS.find((l) => l.id === 'bazaar');
    expect(myket?.url).toBe('https://myket.ir/app/ir.buildingcharge.app');
    expect(bazaar?.comingSoon).toBe(true);
    expect(bazaar?.url).toBe('');
  });

  it('display includes both; shareable only Myket', () => {
    expect(displayStoreLinks().map((l) => l.id)).toEqual(['myket', 'bazaar']);
    expect(shareableStoreLinks().map((l) => l.id)).toEqual(['myket']);
  });
});
