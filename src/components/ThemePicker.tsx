import { useId, useState, type ReactNode } from 'react';
import { IconCheck, IconChevronDown, IconMoon, IconSun } from './Icons';
import { useTheme } from '../context/ThemeContext';
import { paletteSwatches } from '../logic/darkColor';
import { lightSwatches } from '../logic/lightColor';
import { DARK_PALETTES, DARK_PALETTE_ORDER, type DarkPaletteId } from '../logic/darkPalettes';
import { DEFAULT_LIGHT_PALETTE, LIGHT_PALETTES, LIGHT_PALETTE_ORDER, type LightPaletteId } from '../logic/lightPalettes';

/** پیش‌نمایش کوچک پالت: پس‌زمینه، کارت، نوار متن و سه نقطهٔ اصلی/موفق/خطا (رنگ‌ها از همان تبدیل واقعی تم) */
function Mini({ sw }: { sw: string[] }) {
  const [bg, card, text, primary, success, danger] = sw;
  return (
    <span className="tp-mini" style={{ background: bg }} aria-hidden="true">
      <span className="tp-mini__card" style={{ background: card }}>
        <span className="tp-mini__bar" style={{ background: text }} />
        <span className="tp-mini__dots">
          <i style={{ background: primary }} /><i style={{ background: success }} /><i style={{ background: danger }} />
        </span>
      </span>
    </span>
  );
}

function Strip({ sw }: { sw: string[] }) {
  const [bg, card, , primary] = sw;
  return (
    <span className="tp-strip" aria-hidden="true">
      {[bg, card, primary].map((c, i) => <i key={i} style={{ background: c }} />)}
    </span>
  );
}

interface PalRow { id: string; name: string; desc: string; sw: string[]; isDefault: boolean }

/** یک حالت (تاریک/روشن): سرِ بازشونده با رادیو + فهرست پالت‌ها (۵ ردیف رادیویی با پیش‌نمایش کوچک) */
function ModeBlock({ icon, title, current, active, subtitle, strip, label, rows, activeId, onPick }: {
  icon: ReactNode; title: string; current: boolean; active: boolean; subtitle: string; strip: string[]; label: string;
  rows: PalRow[]; activeId: string; onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const bodyId = `${uid}-pals`;
  return (
    <div className={'tp-mode' + (current ? ' is-current' : '') + (open ? ' is-open' : '')}>
      <button type="button" className="tp-mode__head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
        <span className="tp-radio" aria-hidden="true" />
        <span className="tp-ico" aria-hidden="true">{icon}</span>
        <span className="tp-txt">
          <span className="tp-title">{title}{active && <span className="tp-cur">فعال</span>}</span>
          <span className="tp-sub">{subtitle}</span>
        </span>
        {!open && <Strip sw={strip} />}
        <IconChevronDown size={22} className="tp-chev" />
      </button>
      <div id={bodyId} className="tp-body" role="radiogroup" aria-label={label} hidden={!open}>
        {rows.map((p) => {
          const on = active && activeId === p.id;
          return (
            <button key={p.id} type="button" role="radio" aria-checked={on} className={'tp-pal' + (on ? ' is-active' : '')} onClick={() => onPick(p.id)}>
              <Mini sw={p.sw} />
              <span className="tp-pal__txt">
                <span className="tp-pal__name">{p.name}{p.isDefault && <span className="tp-def">پیش‌فرض</span>}</span>
                <span className="tp-pal__desc">{p.desc}</span>
              </span>
              <span className="tp-check" aria-hidden="true"><IconCheck size={14} strokeWidth={3.4} /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const DARK_ROWS: PalRow[] = DARK_PALETTE_ORDER.map((id) => ({ id, name: DARK_PALETTES[id].name, desc: DARK_PALETTES[id].desc, sw: paletteSwatches(id), isDefault: id === 'navy' }));
const LIGHT_ROWS: PalRow[] = LIGHT_PALETTE_ORDER.map((id) => ({ id, name: LIGHT_PALETTES[id].name, desc: LIGHT_PALETTES[id].desc, sw: lightSwatches(id), isDefault: id === DEFAULT_LIGHT_PALETTE }));

/**
 * گروه «تم» در تنظیمات ← تنظیمات ظاهری: دو حالت بازشونده، «تاریک» (۴ پالت) و «روشن» (۵ پالت؛ «آسمانی» پیش‌فرض).
 * انتخاب پالت همان لحظه اعمال و ذخیره می‌شود و حالت را هم عوض می‌کند؛ با دکمهٔ ماه/خورشید سرصفحه هم‌گام است.
 */
export function ThemePicker() {
  const { theme, palette, lightPalette, setPalette, setLightPalette } = useTheme();
  const dark = theme === 'dark';
  return (
    <div className="settings-group tp-group" role="group" aria-labelledby="theme-title">
      <h3 className="settings-sub" id="theme-title">تم</h3>
      <p className="card__hint">حالت ظاهری برنامه را انتخاب کنید. با انتخاب هر پالت، همان لحظه اعمال و روی همین گوشی ذخیره می‌شود.</p>
      <div className="tp-modes">
        <ModeBlock
          icon={<IconMoon size={20} />} title="تاریک" current={dark} active={dark} subtitle={`پالت: ${DARK_PALETTES[palette].name}`}
          strip={paletteSwatches(palette)} label="پالت‌های تاریک" rows={DARK_ROWS} activeId={palette} onPick={(id) => setPalette(id as DarkPaletteId)}
        />
        <ModeBlock
          icon={<IconSun size={20} />} title="روشن" current={!dark} active={!dark} subtitle={`پالت: ${LIGHT_PALETTES[lightPalette].name}`}
          strip={lightSwatches(lightPalette)} label="پالت‌های روشن" rows={LIGHT_ROWS} activeId={lightPalette} onPick={(id) => setLightPalette(id as LightPaletteId)}
        />
      </div>
    </div>
  );
}
