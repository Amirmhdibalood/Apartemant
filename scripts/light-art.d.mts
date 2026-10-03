export const LIGHT_ART_FILES: { id: 'paper' | 'mint' | 'lavender' | 'graycool'; src: string; out: string }[];
export function lightArtName(base: string, id: string): string;
export function generateLightArt(svg: string, id: string): string;
