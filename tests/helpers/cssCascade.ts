/**
 * مفسّر مینی‌مالِ آبشاری CSS برای آزمون‌ها (بدون jsdom): انتخاب‌گرهای ساده (class، attr، :root، :not، ترکیب‌گرهای فاصله/>/+/~)،
 * ویژگی (specificity) و ترتیب برگه‌ها. برای تشخیص این‌که کدام اعلان در یک تم «برنده» است — همان چیزی که مرورگر حساب می‌کند.
 */
export interface Decl { prop: string; value: string; important: boolean }
export interface CssRule { sel: string; decls: Decl[]; order: number; sheet: string }
export interface El { tag: string; classes: string[]; attrs: Record<string, string>; parent: El | null; prev: El | null; root?: boolean }

export function parseCss(css: string, sheet: string, startOrder = 0): CssRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: CssRule[] = [];
  let order = startOrder;
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selText = m[1].trim();
    if (selText.startsWith('@')) continue;
    const decls: Decl[] = [];
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':'); if (i <= 0) continue;
      let v = d.slice(i + 1).trim(); const important = /!important\s*$/.test(v); v = v.replace(/\s*!important\s*$/, '');
      decls.push({ prop: d.slice(0, i).trim(), value: v, important });
    }
    for (const one of splitTop(selText, ',')) out.push({ sel: one.trim(), decls, order: order++, sheet });
  }
  return out;
}

function splitTop(s: string, sep: string): string[] {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++; if (ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}

export interface Compound { tag?: string; classes: string[]; attrs: { name: string; op?: string; val?: string }[]; pseudos: string[]; nots: Compound[]; root: boolean }
export type Complex = { comp: Compound; comb: ' ' | '>' | '+' | '~' | '' }[]; // comb = ترکیب‌گر با عنصر «قبلی» (چپ)

function parseCompound(s: string): Compound {
  const c: Compound = { classes: [], attrs: [], pseudos: [], nots: [], root: false };
  let i = 0;
  const ident = () => { const m = /^[-\w\u0080-\uffff]+/.exec(s.slice(i)); const r = m ? m[0] : ''; i += r.length; return r; };
  const tag = /^[a-zA-Z][\w-]*/.exec(s); if (tag) { c.tag = tag[0]; i = tag[0].length; } else if (s[0] === '*') i = 1;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '.') { i++; c.classes.push(ident()); }
    else if (ch === '#') { i++; c.attrs.push({ name: 'id', op: '=', val: ident() }); }
    else if (ch === '[') {
      const j = s.indexOf(']', i); const body = s.slice(i + 1, j); i = j + 1;
      const m = /^([\w-]+)(?:([~|^$*]?=)"?([^"]*)"?)?$/.exec(body.trim()); if (!m) throw new Error('attr? ' + body);
      c.attrs.push({ name: m[1], op: m[2], val: m[3] });
    } else if (ch === ':') {
      i++; if (s[i] === ':') i++;
      const name = ident();
      if (s[i] === '(') {
        let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '(') d++; if (s[j] === ')') { d--; if (d === 0) break; } }
        const arg = s.slice(i + 1, j); i = j + 1;
        if (name === 'not') for (const a of splitTop(arg, ',')) c.nots.push(parseCompound(a.trim()));
        else c.pseudos.push(`${name}(${arg})`);
      } else if (name === 'root') c.root = true; else c.pseudos.push(name);
    } else throw new Error('compound? ' + s);
  }
  return c;
}

export function parseSelector(sel: string): Complex {
  const out: Complex = []; let comb: Complex[number]['comb'] = '';
  const re = /\s*([>+~])\s*|\s+/g; let last = 0; const s = sel.trim();
  // جدا کردن در سطح بالا (بدون شکستن [...] و (...))
  const parts: { text: string; comb: Complex[number]['comb'] }[] = [];
  let depth = 0, cur = '', pend: Complex[number]['comb'] = '';
  const flush = () => { if (cur) { parts.push({ text: cur, comb: pend }); cur = ''; pend = ''; } };
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === '[' || ch === '(') depth++; if (ch === ']' || ch === ')') depth--;
    if (depth === 0 && /\s/.test(ch)) { flush(); if (!pend) pend = ' '; continue; }
    if (depth === 0 && '>+~'.includes(ch)) { flush(); pend = ch as '>'; continue; }
    cur += ch;
  }
  flush(); void re; void last; void comb;
  parts.forEach((p, idx) => out.push({ comp: parseCompound(p.text), comb: idx === 0 ? '' : (p.comb || ' ') }));
  return out;
}

export function specificity(sel: Complex): number {
  let a = 0, b = 0, c = 0;
  const addC = (k: Compound) => {
    if (k.tag) c++; b += k.classes.length + k.attrs.length + k.pseudos.length + (k.root ? 1 : 0);
    if (k.nots.length) { let m = 0; for (const n of k.nots) { const s = (n.tag ? 1 : 0) * 1 + 0; void s; const bb = n.classes.length + n.attrs.length + n.pseudos.length + (n.root ? 1 : 0); m = Math.max(m, bb); } b += m; }
  };
  for (const x of sel) addC(x.comp);
  return a * 1e6 + b * 1e3 + c;
}

function matchCompound(k: Compound, el: El, live: Set<string>): boolean {
  if (k.tag && k.tag !== el.tag) return false;
  if (k.root && !el.root) return false;
  for (const c of k.classes) if (!el.classes.includes(c)) return false;
  for (const a of k.attrs) {
    const v = el.attrs[a.name]; if (v === undefined) return false;
    if (a.op === '=' && v !== a.val) return false;
    if (a.op === '~=' && !v.split(/\s+/).includes(a.val ?? '')) return false;
  }
  for (const p of k.pseudos) if (!live.has(p)) return false;
  for (const n of k.nots) if (matchCompound(n, el, live)) return false;
  return true;
}

export function matches(sel: Complex, el: El, live: Set<string> = new Set()): boolean {
  const rec = (idx: number, e: El): boolean => {
    if (!matchCompound(sel[idx].comp, e, live)) return false;
    if (idx === 0) return true;
    const comb = sel[idx].comb;
    if (comb === '>') return !!e.parent && rec(idx - 1, e.parent);
    if (comb === '+') return !!e.prev && rec(idx - 1, e.prev);
    if (comb === '~') { for (let p = e.prev; p; p = p.prev) if (rec(idx - 1, p)) return true; return false; }
    for (let p = e.parent; p; p = p.parent) if (rec(idx - 1, p)) return true;
    return false;
  };
  return rec(sel.length - 1, el);
}

/** اعلان برندهٔ `prop` برای `el` (ویژگی سپس ترتیب)؛ `live` = شبه‌کلاس‌های پویایی که فعال فرض می‌شوند */
export function winner(rules: (CssRule & { parsed: Complex; spec: number })[], el: El, prop: string, live: Set<string> = new Set()) {
  let best: { rule: CssRule; value: string; spec: number } | null = null;
  for (const r of rules) {
    const d = r.decls.find((x) => x.prop === prop); if (!d) continue;
    if (!matches(r.parsed, el, live)) continue;
    const spec = r.spec + (d.important ? 1e9 : 0);
    if (!best || spec > best.spec || (spec === best.spec && r.order > best.rule.order)) best = { rule: r, value: d.value, spec };
  }
  return best;
}

export function prepare(rules: CssRule[]) {
  return rules.flatMap((r) => { try { const parsed = parseSelector(r.sel); return [{ ...r, parsed, spec: specificity(parsed) }]; } catch { return []; } });
}
