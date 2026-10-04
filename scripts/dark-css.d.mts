export const SRC_CSS: string;
export const OUT_CSS: string;
export function generateDarkCss(cssText: string): string;
export function splitDecls(body: string): string[];
export function splitSelectors(sel: string): string[];
export const darkSelector: (prefix: string) => (s: string) => string;
export const isWhite: (v: string) => boolean;
export const KEEP_WHITE: Set<string>;
export function emit(items: { media: string | null; selector: string; decls: string[] }[], prefix: string): string;
