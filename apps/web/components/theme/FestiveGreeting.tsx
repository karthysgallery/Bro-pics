import Link from 'next/link';
import { isSafeHref, type ThemeGreeting } from '@bro-pics/shared';
import { CrescentArt, DandiyaArt, FlagArt, FrameArt, HeartArt, HoliArt, KolamArt, LampsArt, ModakArt, PeacockArt, PookalamArt, RakhiArt } from './FestiveArt';

/** A rangoli mandala around a lit diya. */
function Rangoli() {
  const ring = (n: number, r: number, len: number, w: number, fill: string, rot = 0) =>
    Array.from({ length: n }, (_, i) => (
      <ellipse key={`${r}-${i}`} cx="0" cy={-r} rx={w} ry={len} fill={fill} transform={`rotate(${(360 / n) * i + rot})`} />
    ));
  return (
    <svg viewBox="-120 -120 240 240" className="h-full w-full">
      <g className="festive-spin-slow">
        {ring(16, 92, 18, 7, '#F472B6')}
        {ring(16, 92, 10, 4, '#FDE68A', 11.25)}
        {ring(12, 66, 20, 9, '#F59E0B')}
        {ring(12, 66, 11, 5, '#FB923C', 15)}
        {ring(8, 42, 18, 9, '#22C55E')}
        <circle r="100" fill="none" stroke="#FDE68A" strokeWidth="1.5" strokeDasharray="2 5" />
        <circle r="78" fill="none" stroke="#F9A8D4" strokeWidth="1.2" strokeDasharray="1 4" />
      </g>
      <circle r="30" fill="#7A1E1E" stroke="#FDE68A" strokeWidth="2" />
      {/* the diya */}
      <path className="festive-flame" d="M0 -26 C 7 -16, 7 -9, 0 -5 C -7 -9, -7 -16, 0 -26 Z" fill="#FBBF24" />
      <path d="M0 -20 C 3 -15, 3 -11, 0 -9 C -3 -11, -3 -15, 0 -20 Z" fill="#FFF7D6" />
      <path d="M-20 -4 Q0 22 20 -4 Q0 4 -20 -4 Z" fill="#D97706" />
      <path d="M-20 -4 Q0 4 20 -4" fill="none" stroke="#FDE68A" strokeWidth="1.5" />
    </svg>
  );
}

/** A clay pongal pot boiling over, with sugarcane and the rising sun. */
function PongalPot() {
  return (
    <svg viewBox="0 0 240 240" className="h-full w-full">
      <g className="festive-spin-slow" style={{ transformBox: 'view-box', transformOrigin: '120px 92px' }}>
        {Array.from({ length: 12 }, (_, i) => (
          <rect key={i} x="117" y="10" width="6" height="34" rx="3" fill="#FCD34D" opacity="0.7" transform={`rotate(${i * 30} 120 92)`} />
        ))}
      </g>
      <circle cx="120" cy="92" r="40" fill="#FBBF24" />
      {/* sugarcane */}
      {[34, 206].map((x, k) => (
        <g key={x} transform={`rotate(${k ? 8 : -8} ${x} 220)`}>
          <rect x={x - 5} y="60" width="10" height="165" rx="4" fill="#4D7C0F" />
          {[90, 125, 160, 195].map((y) => (
            <rect key={y} x={x - 5} y={y} width="10" height="3" fill="#A3E635" />
          ))}
          <path d={`M${x} 64 Q${x + (k ? -30 : 30)} 30 ${x + (k ? -40 : 40)} 40 Q${x + (k ? -20 : 20)} 52 ${x} 70 Z`} fill="#65A30D" />
        </g>
      ))}
      {/* overflowing rice */}
      {[96, 110, 124, 138, 150, 104, 132].map((x, i) => (
        <circle key={i} cx={x} cy={i > 4 ? 118 : 126} r={i > 4 ? 9 : 11} fill="#FFFBEB" stroke="#F5F5F4" />
      ))}
      <path d="M88 132 Q90 150 84 158" stroke="#FFFBEB" strokeWidth="7" strokeLinecap="round" fill="none" />
      {/* the pot */}
      <ellipse cx="120" cy="132" rx="38" ry="8" fill="#9A3412" />
      <path d="M84 134 C 70 160, 76 204, 120 210 C 164 204, 170 160, 156 134 Z" fill="#C2410C" />
      <path d="M86 150 Q120 162 154 150" fill="none" stroke="#FDE68A" strokeWidth="3" />
      {[100, 112, 124, 136, 148].map((x) => (
        <circle key={x} cx={x} cy="175" r="2.4" fill="#FFFBEB" />
      ))}
      <path d="M96 188 Q120 200 144 188" fill="none" stroke="#FFFBEB" strokeWidth="2" strokeDasharray="3 4" />
      {/* turmeric leaves tied at the neck */}
      <path d="M96 140 q-14 4 -20 -6 q12 -2 20 6 Z M144 140 q14 4 20 -6 q-12 -2 -20 6 Z" fill="#15803D" />
    </svg>
  );
}

/** A decorated Christmas tree with presents. */
function Tree() {
  const lights = [
    [120, 70, '#F43F5E'],
    [104, 98, '#FACC15'],
    [138, 104, '#3B82F6'],
    [92, 132, '#22C55E'],
    [124, 138, '#F43F5E'],
    [152, 140, '#FACC15'],
    [84, 170, '#3B82F6'],
    [116, 174, '#F97316'],
    [150, 176, '#22C55E'],
  ] as const;
  return (
    <svg viewBox="0 0 240 240" className="h-full w-full">
      <rect x="110" y="196" width="20" height="22" fill="#78350F" />
      <path d="M120 40 L160 102 H80 Z M120 76 L172 146 H68 Z M120 116 L186 194 H54 Z" fill="#166534" />
      <path d="M80 102 Q120 116 160 102 M68 146 Q120 162 172 146 M54 194 Q120 210 186 194" fill="none" stroke="#14532D" strokeWidth="2" />
      <path d="M92 92 Q124 108 150 88 M82 132 Q120 150 162 128 M70 176 Q126 196 176 172" fill="none" stroke="#FDE68A" strokeWidth="2.5" strokeDasharray="1 6" strokeLinecap="round" />
      {lights.map(([x, y, c], i) => (
        <circle key={i} className="festive-bulb" cx={x} cy={y} r="5" fill={c} style={{ animationDelay: `${i * 0.3}s`, color: c }} />
      ))}
      <path className="festive-glow" d="M120 18 L125.5 31 L139 31.5 L128.5 40 L132 53 L120 45.5 L108 53 L111.5 40 L101 31.5 L114.5 31 Z" fill="#FACC15" stroke="#CA8A04" />
      {/* presents */}
      <rect x="62" y="200" width="36" height="28" rx="2" fill="#B91C1C" />
      <rect x="77" y="200" width="6" height="28" fill="#FDE68A" />
      <rect x="146" y="206" width="32" height="22" rx="2" fill="#1D4ED8" />
      <rect x="159" y="206" width="6" height="22" fill="#FDE68A" />
      <path d="M80 200 q-10 -12 -2 -12 q6 0 2 12 q4 -12 10 -12 q8 0 -10 12" fill="#FDE68A" />
    </svg>
  );
}

/** Fireworks over a midnight sky. */
function Fireworks() {
  const burst = (cx: number, cy: number, r: number, color: string, delay: number) => (
    <g key={`${cx}-${cy}`} className="festive-burst" style={{ transformBox: 'view-box', transformOrigin: `${cx}px ${cy}px`, animationDelay: `${delay}s` }}>
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        return (
          <g key={i}>
            <line x1={cx + Math.cos(a) * r * 0.25} y1={cy + Math.sin(a) * r * 0.25} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} stroke={color} strokeWidth="2.4" strokeLinecap="round" />
            <circle cx={cx + Math.cos(a) * (r + 6)} cy={cy + Math.sin(a) * (r + 6)} r="2" fill={color} />
          </g>
        );
      })}
    </g>
  );
  return (
    <svg viewBox="0 0 240 240" className="h-full w-full">
      {burst(84, 80, 44, '#FACC15', 0)}
      {burst(162, 110, 52, '#F472B6', 0.8)}
      {burst(100, 168, 34, '#60A5FA', 1.6)}
      {burst(182, 46, 26, '#FDE68A', 2.2)}
      {[
        [30, 30],
        [210, 200],
        [40, 210],
        [150, 30],
        [220, 120],
      ].map(([x, y], i) => (
        <circle key={i} className="festive-glow" cx={x} cy={y} r="2" fill="#FDE68A" style={{ animationDelay: `${i * 0.4}s` }} />
      ))}
    </svg>
  );
}

const ART: Record<Exclude<ThemeGreeting['art'], 'none'>, () => JSX.Element> = {
  rangoli: Rangoli,
  'pongal-pot': PongalPot,
  tree: Tree,
  fireworks: Fireworks,
  holi: HoliArt,
  dandiya: DandiyaArt,
  lamps: LampsArt,
  modak: ModakArt,
  pookalam: PookalamArt,
  rakhi: RakhiArt,
  crescent: CrescentArt,
  flag: FlagArt,
  heart: HeartArt,
  frame: FrameArt,
  kolam: KolamArt,
  peacock: PeacockArt,
};

/**
 * The festival's greeting card at the top of the homepage: the theme's dark
 * accent as a backdrop, a hand-drawn festival illustration, and an optional
 * call to action — all written by the admin.
 */
export function FestiveGreeting({ greeting }: { greeting: ThemeGreeting }) {
  const Art = greeting.art !== 'none' ? ART[greeting.art] : null;
  const href = greeting.ctaHref && isSafeHref(greeting.ctaHref) ? greeting.ctaHref : null;
  return (
    <section aria-label={greeting.title} className="mx-auto w-full max-w-shell px-4 pt-5 md:px-6 md:pt-6">
      <div className="relative overflow-hidden rounded-3xl bg-accent-dark text-paper">
        {/* soft festive dots */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-25"
          style={{ backgroundImage: 'radial-gradient(rgb(var(--color-gold)) 1px, transparent 1.5px)', backgroundSize: '18px 18px' }}
        />
        <div aria-hidden="true" className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-gold/25 blur-3xl" />
        <div className="relative grid items-center gap-4 p-6 sm:p-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-8 md:p-10">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-gold">Festive season at KarthysGallery</p>
            <h2 className="font-display text-3xl font-bold leading-[1.05] tracking-snug text-paper sm:text-4xl md:text-5xl">{greeting.title}</h2>
            {greeting.subtitle && <p className="max-w-xl text-sm leading-relaxed text-paper/80 md:text-base">{greeting.subtitle}</p>}
            {greeting.ctaLabel && href && (
              <Link href={href} className="inline-flex h-11 items-center rounded-full bg-gold px-6 text-sm font-semibold text-ink shadow-sm transition-colors hover:bg-gold-deep">
                {greeting.ctaLabel}
              </Link>
            )}
          </div>
          {Art && (
            <div aria-hidden="true" className="mx-auto h-40 w-40 sm:h-52 sm:w-52 md:h-60 md:w-60">
              <Art />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
