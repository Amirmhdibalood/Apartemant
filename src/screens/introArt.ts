import type { DarkPaletteId } from '../logic/darkPalettes';
import type { LightPaletteId } from '../logic/lightPalettes';
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
import paperP from '../assets/intro-art-light-paper.svg';
import paperL from '../assets/intro-art-landscape-light-paper.svg';
import mintP from '../assets/intro-art-light-mint.svg';
import mintL from '../assets/intro-art-landscape-light-mint.svg';
import lavenderP from '../assets/intro-art-light-lavender.svg';
import lavenderL from '../assets/intro-art-landscape-light-lavender.svg';
import graycoolP from '../assets/intro-art-light-graycool.svg';
import graycoolL from '../assets/intro-art-landscape-light-graycool.svg';

type Art = { portrait: string; landscape: string };
const DARK_ART: Record<DarkPaletteId, Art> = {
  navy: { portrait: navyP, landscape: navyL },
  charcoal: { portrait: charcoalP, landscape: charcoalL },
  amoled: { portrait: amoledP, landscape: amoledL },
  warm: { portrait: warmP, landscape: warmL },
};
const LIGHT_ART: Record<LightPaletteId, Art> = {
  sky: { portrait: introArt, landscape: introArtLandscape },
  paper: { portrait: paperP, landscape: paperL },
  mint: { portrait: mintP, landscape: mintL },
  lavender: { portrait: lavenderP, landscape: lavenderL },
  graycool: { portrait: graycoolP, landscape: graycoolL },
};

/** تصویر صفحه ورود برای تم/پالت فعلی (تاریک: نسخهٔ شبانهٔ پالت تاریک؛ روشن: نسخهٔ پالت روشن) */
export function introArtFor(dark: boolean, palette: DarkPaletteId, lightPalette: LightPaletteId = 'sky'): Art {
  return dark ? DARK_ART[palette] : LIGHT_ART[lightPalette];
}
