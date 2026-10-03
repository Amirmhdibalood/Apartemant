import { useAdapt } from '../context/ThemeContext';
/** تصویر ساده ساختمان (صفحه اصلی) — SVG داخلی، بدون نیاز به اینترنت */
export function BuildingIllustration() {
  const A = useAdapt();
  const win = (x: number, y: number, k: string) => <rect key={k} x={x} y={y} width="9" height="9" rx="1.5" fill={A('#2F5FD0')} />;
  const smallWin = (x: number, y: number, k: string) => <rect key={k} x={x} y={y} width="7" height="7" rx="1.2" fill={A('#5B7FD8')} />;
  const bigWins = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) bigWins.push(win(96 + c * 16, 34 + r * 17, `b${r}${c}`));
  const smallWins = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) smallWins.push(smallWin(66 + c * 12, 62 + r * 14, `s${r}${c}`));
  return (
    <svg className="illustration" viewBox="0 0 220 140" role="img" aria-label="ساختمان">
      <ellipse cx="110" cy="70" rx="72" ry="62" fill={A('#E3ECFB')} />
      <circle cx="58" cy="66" r="30" fill={A('#E8F0FC')} />
      <circle cx="164" cy="70" r="28" fill={A('#E8F0FC')} />
      <ellipse cx="110" cy="122" rx="82" ry="11" fill={A('#6CC08F')} />
      {/* ساختمان کوچک */}
      <rect x="58" y="50" width="36" height="72" rx="3" fill={A('#A9BFEF')} />
      {smallWins}
      {/* ساختمان اصلی */}
      <rect x="88" y="24" width="58" height="98" rx="3" fill={A('#BCD0F6')} />
      <rect x="88" y="24" width="58" height="6" rx="3" fill={A('#9FB8EE')} />
      {bigWins}
      <rect x="109" y="108" width="16" height="14" rx="1.5" fill={A('#2F5FD0')} />
      {/* درخت‌ها */}
      <rect x="47" y="100" width="3" height="18" fill={A('#6B7A6F')} />
      <circle cx="48.5" cy="96" r="10" fill={A('#4FAE78')} />
      <rect x="168" y="100" width="3" height="18" fill={A('#6B7A6F')} />
      <circle cx="169.5" cy="96" r="10" fill={A('#4FAE78')} />
    </svg>
  );
}

/** نمای شهر کم‌رنگ پایین صفحه اصلی */
export function CitySkyline() {
  const A = useAdapt();
  const b = (x: number, y: number, w: number, k: string) => {
    const wins = [];
    for (let yy = y + 6; yy < 92; yy += 10) for (let xx = x + 4; xx < x + w - 4; xx += 8) wins.push(<rect key={`${k}${xx}-${yy}`} x={xx} y={yy} width="4" height="5" fill={A('#fff')} opacity=".8" />);
    return (
      <g key={k}>
        <rect x={x} y={y} width={w} height={100 - y} fill={A('#DCE5F5')} />
        {wins}
      </g>
    );
  };
  const tree = (x: number, k: string) => (
    <g key={k}>
      <rect x={x - 1} y="84" width="2" height="12" fill={A('#7F8C84')} />
      <circle cx={x} cy="82" r="7" fill={A('#6CBF8E')} />
    </g>
  );
  return (
    <svg className="skyline" viewBox="0 0 360 100" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      {b(40, 50, 26, 'a')}{b(70, 60, 18, 'b')}{b(92, 34, 30, 'c')}{b(126, 64, 20, 'd')}
      {b(150, 48, 26, 'e')}{b(182, 28, 30, 'f')}{b(216, 54, 22, 'g')}{b(242, 40, 24, 'h')}
      {b(270, 62, 20, 'i')}{b(294, 50, 24, 'j')}
      {tree(30, 't1')}{tree(118, 't2')}{tree(206, 't3')}{tree(330, 't4')}
      <rect x="20" y="96" width="320" height="4" rx="2" fill={A('#D3DCEB')} />
    </svg>
  );
}
