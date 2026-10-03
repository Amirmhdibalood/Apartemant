import type { DarkPaletteId } from '../logic/darkPalettes';
import introArt from '../assets/intro-art.svg';
import introArtLandscape from '../assets/intro-art-landscape.svg';
import navyP from '../assets/intro-art-dark.svg';
import navyL from '../assets/intro-art-landscape-dark.svg';
import charcoalP from '../assets/intro-art-dark-charcoal.svg';
import charcoalL from '../assets/intro-art-landscape-dark-charcoal.svg';
import amoledP from '../assets/intro-art-dark-amoled.svg';
import amoledL from '../assets/intro-art-landscape-dark-amoled.svg';
import warmP from '../assets/intro-art-dark-warm.svg';
import warmL from '../assets/intro-art-landscape-dark-warm.svg';

const DARK_ART: Record<DarkPaletteId, { portrait: string; landscape: string }> = {
  navy: { portrait: navyP, landscape: navyL },
  charcoal: { portrait: charcoalP, landscape: charcoalL },
  amoled: { portrait: amoledP, landscape: amoledL },
  warm: { portrait: warmP, landscape: warmL },
};

/** تصویر صفحه ورود برای تم/پالت فعلی (تاریک: نسخهٔ شبانهٔ همان پالت) */
export function introArtFor(dark: boolean, palette: DarkPaletteId): { portrait: string; landscape: string } {
  return dark ? DARK_ART[palette] : { portrait: introArt, landscape: introArtLandscape };
}
