import { useId, useState } from 'react';
import { IconCheck, IconChevronDown, IconMoon, IconSun } from './Icons';
import { useTheme } from '../context/ThemeContext';
import { paletteSwatches } from '../logic/darkColor';
import { DARK_PALETTES, DARK_PALETTE_ORDER, type DarkPaletteId } from '../logic/darkPalettes';

/** پیش‌نمایش کوچک پالت: پس‌زمینه، کارت، نوار متن و سه نقطهٔ اصلی/موفق/خطا (رنگ‌ها از همان تبدیل واقعی تم) */
function PaletteMini({ id }: { id: DarkPaletteId }) {
  const [bg, card, text, primary, success, danger] = paletteSwatches(id);
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

function PaletteStrip({ id }: { id: DarkPaletteId }) {
  const [bg, card, , primary] = paletteSwatches(id);
  return (
    <span className="tp-strip" aria-hidden="true">
      {[bg, card, primary].map((c, i) => <i key={i} style={{ background: c }} />)}
    </span>
  );
}

/**
 * گروه «تم» در تنظیمات ← تنظیمات ظاهری: حالت «تاریک» (بازشونده با ۴ پالت) و «روشن» (به‌زودی گونه‌های بیشتر).
 * انتخاب پالت همان لحظه اعمال و ذخیره می‌شود؛ حالت با دکمهٔ ماه/خورشید سرصفحه هم‌گام است.
 */
export function ThemePicker() {
  const { theme, palette, setTheme, setPalette } = useTheme();
  const [open, setOpen] = useState(false);
  const uid = useId();
  const dark = theme === 'dark';
  const bodyId = `${uid}-pals`;

  return (
    <div className="settings-group tp-group" role="group" aria-labelledby="theme-title">
      <h3 className="settings-sub" id="theme-title">تم</h3>
      <p className="card__hint">حالت ظاهری برنامه را انتخاب کنید. با انتخاب هر پالت تاریک، همان لحظه اعمال و روی همین گوشی ذخیره می‌شود.</p>
      <div className="tp-modes">
        <div className={'tp-mode' + (dark ? ' is-current' : '') + (open ? ' is-open' : '')}>
          <button type="button" className="tp-mode__head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
            <span className="tp-radio" aria-hidden="true" />
            <span className="tp-ico" aria-hidden="true"><IconMoon size={20} /></span>
            <span className="tp-txt">
              <span className="tp-title">تاریک{dark && <span className="tp-cur">فعال</span>}</span>
              <span className="tp-sub">پالت: {DARK_PALETTES[palette].name}</span>
            </span>
            {!open && <PaletteStrip id={palette} />}
            <IconChevronDown size={22} className="tp-chev" />
          </button>
          <div id={bodyId} className="tp-body" role="radiogroup" aria-label="پالت‌های تاریک" hidden={!open}>
            {DARK_PALETTE_ORDER.map((id) => {
              const p = DARK_PALETTES[id];
              const active = dark && palette === id;
              return (
                <button key={id} type="button" role="radio" aria-checked={active} className={'tp-pal' + (active ? ' is-active' : '')} onClick={() => setPalette(id)}>
                  <PaletteMini id={id} />
                  <span className="tp-pal__txt">
                    <span className="tp-pal__name">{p.name}{id === 'navy' && <span className="tp-def">پیش‌فرض</span>}</span>
                    <span className="tp-pal__desc">{p.desc}</span>
                  </span>
                  <span className="tp-check" aria-hidden="true"><IconCheck size={14} strokeWidth={3.4} /></span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={'tp-mode' + (!dark ? ' is-current' : '')}>
          <button type="button" className="tp-mode__head" aria-pressed={!dark} onClick={() => setTheme('light')}>
            <span className="tp-radio" aria-hidden="true" />
            <span className="tp-ico" aria-hidden="true"><IconSun size={20} /></span>
            <span className="tp-txt">
              <span className="tp-title">روشن<span className="tp-soon">به‌زودی</span>{!dark && <span className="tp-cur">فعال</span>}</span>
              <span className="tp-sub">تم روشن فعلی؛ گونه‌های بیشتر بعداً اضافه می‌شوند.</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
