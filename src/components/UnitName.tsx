import { sanitizeAlias } from '../logic/building';

/** نام واحد: «واحد ۱» یا «واحد ۱ - آقای رضایی» (اسم مستعار از عکس لحظه‌ای قبض) */
export function UnitName({ n, alias, prefix = 'واحد' }: { n: number; alias?: string | null; prefix?: string }) {
  const a = sanitizeAlias(alias);
  return (
    <span className="unit-name">
      {prefix} <span className="num">{n}</span>
      {a && <> - {a}</>}
    </span>
  );
}
