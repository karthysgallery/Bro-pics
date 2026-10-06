import type { ThemeDecor } from '@bro-pics/shared';

/**
 * A festive garland strung along the bottom edge of the header. Drawn on a
 * 2400-wide canvas at real size and sliced to the screen, so phones see the middle swags
 * and wide screens the whole string. Purely decorative: no pointer events,
 * hidden from screen readers.
 */

const W = 2400;
const SWAG = 120;
const SWAGS = W / SWAG;
const SAG = 18;

/** Point on swag `i` at 0..1 along it (a gentle catenary-like curve). */
function along(i: number, t: number, sag = SAG): [number, number] {
  return [i * SWAG + SWAG * t, 3 + 4 * sag * t * (1 - t)];
}

function rope(sag = SAG, stroke = '#6b4a2b', width = 1.4) {
  const d = Array.from({ length: SWAGS }, (_, i) => `M${i * SWAG},3 Q${i * SWAG + SWAG / 2},${3 + 2 * sag} ${(i + 1) * SWAG},3`).join(' ');
  return <path d={d} fill="none" stroke={stroke} strokeWidth={width} />;
}

const MARIGOLD = ['#F59E0B', '#FB923C', '#FCD34D', '#F97316'];

/** A marigold bloom: layered petal rings. */
function Marigold({ x, y, r, c }: { x: number; y: number; r: number; c: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={c} />
      <circle cx={x} cy={y} r={r} fill="none" stroke="#B45309" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="1.6 1.4" />
      <circle cx={x} cy={y} r={r * 0.55} fill="none" stroke="#B45309" strokeOpacity="0.35" strokeWidth="0.9" strokeDasharray="1.2 1.2" />
      <circle cx={x - r * 0.3} cy={y - r * 0.35} r={r * 0.28} fill="#fff" opacity="0.35" />
    </g>
  );
}

function MangoLeaf({ x, y, len = 16, rot = 0 }: { x: number; y: number; len?: number; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d={`M0 0 C ${len * 0.35} ${len * 0.25}, ${len * 0.25} ${len * 0.85}, 0 ${len} C ${-len * 0.25} ${len * 0.85}, ${-len * 0.35} ${len * 0.25}, 0 0 Z`} fill="#3F7D3A" />
      <path d={`M0 1 L0 ${len - 2}`} stroke="#A7D08C" strokeWidth="0.7" opacity="0.8" />
    </g>
  );
}

function marigoldGarland() {
  const items: JSX.Element[] = [];
  for (let i = 0; i < SWAGS; i++) {
    for (let k = 1; k <= 9; k++) {
      const [x, y] = along(i, k / 10);
      items.push(<Marigold key={`m${i}-${k}`} x={x} y={y} r={5} c={MARIGOLD[(i + k) % MARIGOLD.length]} />);
    }
    // A drop at each knot: a short string of blooms ending in a mango leaf.
    const x = i * SWAG;
    items.push(
      <g key={`d${i}`}>
        <line x1={x} y1={3} x2={x} y2={30} stroke="#6b4a2b" strokeWidth="1" />
        <Marigold x={x} y={12} r={4.4} c={MARIGOLD[i % 4]} />
        <Marigold x={x} y={21} r={4} c={MARIGOLD[(i + 2) % 4]} />
        <MangoLeaf x={x} y={25} len={17} rot={i % 2 ? 8 : -8} />
      </g>
    );
  }
  return (
    <>
      {rope(SAG, '#6b4a2b', 1)}
      {items}
    </>
  );
}

function thoranam() {
  // A straight cord of mango leaves with a marigold every few leaves.
  const items: JSX.Element[] = [];
  for (let x = 6, n = 0; x < W; x += 15, n++) {
    if (n % 5 === 2) items.push(<Marigold key={`f${n}`} x={x} y={9} r={5} c={MARIGOLD[n % 4]} />);
    else items.push(<MangoLeaf key={`l${n}`} x={x} y={5} len={n % 2 ? 22 : 26} rot={n % 2 ? 6 : -6} />);
  }
  return (
    <>
      <line x1="0" y1="4" x2={W} y2="4" stroke="#6b4a2b" strokeWidth="1.6" />
      {items}
    </>
  );
}

const BULBS = ['#F43F5E', '#22C55E', '#FACC15', '#3B82F6', '#F97316'];

function stringLights() {
  const items: JSX.Element[] = [];
  let n = 0;
  for (let i = 0; i < SWAGS; i++) {
    for (let k = 1; k <= 5; k++, n++) {
      const [x, y] = along(i, k / 6);
      const c = BULBS[n % BULBS.length];
      items.push(
        <g key={n} transform={`translate(${x} ${y})`}>
          <rect x="-1.8" y="0" width="3.6" height="4" rx="0.8" fill="#3a3a3a" />
          <ellipse className="festive-bulb" cx="0" cy="9" rx="3.4" ry="5.2" fill={c} style={{ animationDelay: `${(n % 7) * 0.35}s`, color: c }} />
          <ellipse cx="-1" cy="7.5" rx="0.9" ry="1.8" fill="#fff" opacity="0.6" />
        </g>
      );
    }
  }
  return (
    <>
      {rope(SAG, '#2f3b2f', 1.2)}
      {items}
    </>
  );
}

function bunting() {
  const colors = ['rgb(var(--color-gold))', 'rgb(var(--color-accent))', 'rgb(var(--color-paper))', 'rgb(var(--color-gold-deep))'];
  const items: JSX.Element[] = [];
  let n = 0;
  for (let i = 0; i < SWAGS; i++) {
    for (let k = 1; k <= 5; k++, n++) {
      const [x, y] = along(i, k / 6, 12);
      const [x2, y2] = along(i, k / 6 + 0.05, 12);
      const angle = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI;
      items.push(
        <g key={n} transform={`translate(${x} ${y}) rotate(${angle})`}>
          <path d="M-8 0 L8 0 L0 17 Z" fill={colors[n % colors.length]} stroke="rgb(var(--color-line))" strokeWidth="0.6" />
          {n % 3 === 0 && <circle cx="0" cy="6" r="1.6" fill="rgb(var(--color-paper))" opacity="0.8" />}
        </g>
      );
    }
  }
  return (
    <>
      {rope(12, '#b49a5a', 1.1)}
      {items}
    </>
  );
}

function diyaRow() {
  const items: JSX.Element[] = [];
  for (let x = 30, n = 0; x < W; x += 60, n++) {
    items.push(
      <g key={n} transform={`translate(${x} 20)`}>
        <path className="festive-flame" d="M0 -14 C 3.5 -9, 3.5 -5, 0 -3 C -3.5 -5, -3.5 -9, 0 -14 Z" fill="#FBBF24" style={{ animationDelay: `${(n % 5) * 0.2}s` }} />
        <path d="M0 -11 C 1.6 -8.5, 1.6 -6, 0 -5 C -1.6 -6, -1.6 -8.5, 0 -11 Z" fill="#FFF7D6" />
        <path d="M-12 -2 Q0 12 12 -2 Q0 3 -12 -2 Z" fill="#B45309" />
        <path d="M-12 -2 Q0 3 12 -2" fill="none" stroke="#FCD34D" strokeWidth="1" />
        <circle cx="-5" cy="2" r="0.9" fill="#FCD34D" />
        <circle cx="5" cy="2" r="0.9" fill="#FCD34D" />
      </g>
    );
  }
  return <>{items}</>;
}

/** Saffron, white and green pennants, as strung for Independence and Republic Day. */
function tricolor() {
  const colors = ['#FF9933', '#FFFFFF', '#138808'];
  const items: JSX.Element[] = [];
  let n = 0;
  for (let i = 0; i < SWAGS; i++) {
    for (let k = 1; k <= 6; k++, n++) {
      const [x, y] = along(i, k / 7, 12);
      const [x2, y2] = along(i, k / 7 + 0.05, 12);
      const angle = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI;
      items.push(
        <g key={n} transform={`translate(${x} ${y}) rotate(${angle})`}>
          <path d="M-7 0 L7 0 L0 16 Z" fill={colors[n % 3]} stroke="#cbd5e1" strokeWidth="0.6" />
          {n % 3 === 1 && <circle cx="0" cy="5" r="2" fill="none" stroke="#000080" strokeWidth="0.7" />}
        </g>
      );
    }
  }
  return (
    <>
      {rope(12, '#64748b', 1)}
      {items}
    </>
  );
}

function Heart({ x, y, size, fill }: { x: number; y: number; size: number; fill: string }) {
  const s = size / 20;
  return <path transform={`translate(${x - 10 * s} ${y}) scale(${s})`} d="M10 18 C 3 12, 0 8, 0 5 C 0 2, 2.5 0, 5 0 C 7 0, 9 1.2, 10 3 C 11 1.2, 13 0, 15 0 C 17.5 0, 20 2, 20 5 C 20 8, 17 12, 10 18 Z" fill={fill} />;
}

function heartGarland() {
  const fills = ['rgb(var(--color-accent))', 'rgb(var(--color-gold))', '#F43F5E', 'rgb(var(--color-gold-deep))'];
  const items: JSX.Element[] = [];
  let n = 0;
  for (let i = 0; i < SWAGS; i++) {
    for (let k = 1; k <= 6; k++, n++) {
      const [x, y] = along(i, k / 7, 14);
      items.push(<Heart key={n} x={x} y={y - 1} size={n % 2 ? 12 : 15} fill={fills[n % fills.length]} />);
    }
  }
  return (
    <>
      {rope(14, '#be7c8f', 1)}
      {items}
    </>
  );
}

const RENDER: Record<Exclude<ThemeDecor['garland'], 'none'>, () => JSX.Element> = {
  marigold: marigoldGarland,
  thoranam,
  'string-lights': stringLights,
  bunting,
  'diya-row': diyaRow,
  tricolor,
  hearts: heartGarland,
};

const HEIGHT: Record<Exclude<ThemeDecor['garland'], 'none'>, number> = {
  marigold: 44,
  thoranam: 34,
  'string-lights': 42,
  bunting: 38,
  'diya-row': 30,
  tricolor: 36,
  hearts: 36,
};

/** `overlay`: hangs over the top of the page from the header (the shop); otherwise takes its own space (previews). */
export function FestiveGarland({ garland, overlay = true }: { garland: ThemeDecor['garland']; overlay?: boolean }) {
  if (garland === 'none') return null;
  const h = HEIGHT[garland];
  return (
    <div aria-hidden="true" className={overlay ? 'pointer-events-none absolute inset-x-0 top-full z-10 overflow-hidden' : 'overflow-hidden'} style={{ height: h }}>
      <svg width="100%" height={h} viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="xMidYMin slice" className="block drop-shadow-[0_2px_2px_rgba(0,0,0,0.12)]">
        {RENDER[garland]()}
      </svg>
    </div>
  );
}
