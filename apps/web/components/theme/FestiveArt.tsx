/**
 * Greeting pictures for the newer festivals and occasions, drawn for the
 * dark greeting banner (240×240). Each is a simple, recognisable symbol.
 */

const svg = (children: React.ReactNode) => (
  <svg viewBox="0 0 240 240" className="h-full w-full">
    {children}
  </svg>
);

/** Holi: bursts of gulal colour with a pichkari. */
export function HoliArt() {
  const puffs = [
    [80, 80, 46, '#EC4899'],
    [158, 74, 40, '#F59E0B'],
    [120, 140, 52, '#22C55E'],
    [70, 168, 34, '#3B82F6'],
    [176, 158, 36, '#A855F7'],
  ] as const;
  return svg(
    <>
      {puffs.map(([x, y, r, c], i) => (
        <g key={i} className="festive-glow" style={{ animationDelay: `${i * 0.4}s` }}>
          <circle cx={x} cy={y} r={r} fill={c} opacity="0.55" />
          {Array.from({ length: 10 }, (_, k) => {
            const a = (k / 10) * Math.PI * 2 + i;
            return <circle key={k} cx={x + Math.cos(a) * (r + 8)} cy={y + Math.sin(a) * (r + 8)} r={3 + (k % 3)} fill={c} opacity="0.8" />;
          })}
        </g>
      ))}
      {/* pichkari */}
      <g transform="rotate(-28 120 120)">
        <rect x="86" y="112" width="70" height="16" rx="6" fill="#FDE68A" stroke="#B45309" strokeWidth="2" />
        <rect x="156" y="116" width="26" height="8" rx="3" fill="#B45309" />
        <rect x="60" y="116" width="26" height="8" rx="2" fill="#92400E" />
      </g>
    </>
  );
}

/** Navratri: crossed dandiya sticks with tassels. */
export function DandiyaArt() {
  const stick = (rot: number, c: string) => (
    <g transform={`rotate(${rot} 120 120)`}>
      <rect x="114" y="30" width="12" height="180" rx="6" fill={c} />
      {[60, 95, 130, 165].map((y) => (
        <rect key={y} x="114" y={y} width="12" height="8" fill="#FDE68A" />
      ))}
      {[48, 120, 192].map((y) => (
        <circle key={y} cx="120" cy={y} r="3" fill="#fff" />
      ))}
      <path d="M120 210 l-6 18 M120 210 l0 20 M120 210 l6 18" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
  return svg(
    <>
      <circle cx="120" cy="120" r="92" fill="none" stroke="#FDE68A" strokeWidth="1.5" strokeDasharray="2 6" className="festive-spin-slow" />
      {stick(-30, '#DB2777')}
      {stick(30, '#F59E0B')}
      <circle cx="120" cy="120" r="10" fill="#FDE68A" />
    </>
  );
}

/** A row of lit agal vilakku (clay lamps). */
export function LampsArt() {
  const lamp = (x: number, y: number, s: number, d: number) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="6" rx="34" ry="10" fill="#FBBF24" opacity="0.18" className="festive-glow" />
      <path className="festive-flame" style={{ animationDelay: `${d}s` }} d="M0 -34 C 9 -22, 9 -12, 0 -6 C -9 -12, -9 -22, 0 -34 Z" fill="#FBBF24" />
      <path d="M0 -26 C 4 -19, 4 -14, 0 -11 C -4 -14, -4 -19, 0 -26 Z" fill="#FFF7D6" />
      <path d="M-26 -4 Q0 26 26 -4 Q0 5 -26 -4 Z" fill="#C2410C" />
      <path d="M-26 -4 Q0 5 26 -4" fill="none" stroke="#FDE68A" strokeWidth="2" />
      <path d="M-14 6 Q0 12 14 6" fill="none" stroke="#FDE68A" strokeWidth="1.5" strokeDasharray="2 3" />
    </g>
  );
  return svg(
    <>
      {lamp(120, 100, 1.25, 0)}
      {lamp(56, 162, 0.95, 0.3)}
      {lamp(184, 162, 0.95, 0.6)}
      {lamp(120, 206, 0.8, 0.9)}
    </>
  );
}

/** Ganesh Chaturthi: a plate of modaks with a marigold. */
export function ModakArt() {
  const modak = (x: number, y: number, s: number) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 -34 C 8 -24, 26 -8, 26 10 C 26 22, 14 28, 0 28 C -14 28, -26 22, -26 10 C -26 -8, -8 -24, 0 -34 Z" fill="#FFF7E6" stroke="#E7C79A" strokeWidth="1.5" />
      {[-16, -8, 0, 8, 16].map((dx) => (
        <path key={dx} d={`M${dx * 0.4} -30 Q${dx} 0 ${dx * 1.2} 26`} fill="none" stroke="#E7C79A" strokeWidth="1.2" />
      ))}
    </g>
  );
  return svg(
    <>
      <ellipse cx="120" cy="182" rx="96" ry="22" fill="#B45309" />
      <ellipse cx="120" cy="176" rx="96" ry="20" fill="#D97706" />
      <ellipse cx="120" cy="176" rx="80" ry="14" fill="none" stroke="#FDE68A" strokeWidth="2" strokeDasharray="3 5" />
      {modak(80, 146, 1)}
      {modak(160, 146, 1)}
      {modak(120, 128, 1.2)}
      <g transform="translate(120 70)">
        {Array.from({ length: 12 }, (_, i) => (
          <ellipse key={i} cx="0" cy="-14" rx="6" ry="12" fill={i % 2 ? '#F97316' : '#F59E0B'} transform={`rotate(${i * 30})`} />
        ))}
        <circle r="8" fill="#B45309" />
      </g>
    </>
  );
}

/** Onam: a pookalam flower carpet. */
export function PookalamArt() {
  const ring = (n: number, r: number, color: string, w: number, rot = 0) =>
    Array.from({ length: n }, (_, i) => <path key={`${r}-${i}`} d={`M0 ${-r} L${w} ${-r + w * 2.4} L0 ${-r + w * 4} L${-w} ${-r + w * 2.4} Z`} fill={color} transform={`rotate(${(360 / n) * i + rot})`} />);
  return svg(
    <g transform="translate(120 120)">
      <circle r="106" fill="#FDE68A" />
      <circle r="98" fill="#F97316" />
      <g className="festive-spin-slow">
        {ring(24, 98, '#FEF3C7', 9)}
        {ring(16, 72, '#DC2626', 10, 11)}
      </g>
      <circle r="60" fill="#FACC15" />
      {ring(12, 58, '#16A34A', 9)}
      <circle r="34" fill="#FFFFFF" />
      {ring(8, 32, '#A855F7', 7, 22)}
      <circle r="12" fill="#F97316" />
      <circle r="4" fill="#FEF3C7" />
    </g>
  );
}

/** Raksha Bandhan: a rakhi with a decorated centre and tied threads. */
export function RakhiArt() {
  return svg(
    <>
      <path d="M10 124 Q60 104 120 120 Q180 136 230 116" fill="none" stroke="#DC2626" strokeWidth="6" strokeLinecap="round" />
      <path d="M10 124 Q60 104 120 120 Q180 136 230 116" fill="none" stroke="#FDE68A" strokeWidth="2" strokeDasharray="6 6" />
      <path d="M14 124 l-8 22 M14 124 l4 24 M226 116 l8 22 M226 116 l-4 24" stroke="#DC2626" strokeWidth="4" strokeLinecap="round" />
      <g transform="translate(120 120)" className="festive-glow">
        {Array.from({ length: 16 }, (_, i) => (
          <ellipse key={i} cx="0" cy="-46" rx="9" ry="20" fill={i % 2 ? '#F59E0B' : '#EC4899'} transform={`rotate(${i * 22.5})`} />
        ))}
      </g>
      <circle cx="120" cy="120" r="34" fill="#FDE68A" stroke="#B45309" strokeWidth="3" />
      <circle cx="120" cy="120" r="22" fill="#DC2626" />
      {Array.from({ length: 8 }, (_, i) => (
        <circle key={i} cx={120 + Math.cos((i / 8) * Math.PI * 2) * 28} cy={120 + Math.sin((i / 8) * Math.PI * 2) * 28} r="3" fill="#fff" />
      ))}
      <circle cx="120" cy="120" r="9" fill="#FDE68A" />
    </>
  );
}

/** Eid: crescent moon, star and a hanging lantern. */
export function CrescentArt() {
  return svg(
    <>
      <circle cx="104" cy="112" r="88" fill="#FDE68A" opacity="0.08" className="festive-glow" />
      <defs>
        <mask id="eid-crescent">
          <rect width="240" height="240" fill="#fff" />
          <circle cx="138" cy="98" r="70" fill="#000" />
        </mask>
      </defs>
      <circle cx="104" cy="112" r="80" fill="#E2B54F" mask="url(#eid-crescent)" />
      <path d="M168 70 L174 86 L191 87 L178 98 L182 115 L168 105 L154 115 L158 98 L145 87 L162 86 Z" fill="#FDE68A" className="festive-glow" />
      <line x1="196" y1="120" x2="196" y2="150" stroke="#FDE68A" strokeWidth="1.5" />
      <path d="M184 150 h24 l4 10 l-4 40 h-24 l-4 -40 Z" fill="#0F5B45" stroke="#E2B54F" strokeWidth="2" />
      <path d="M190 162 h12 v30 h-12 Z" fill="#FDE68A" className="festive-glow" />
      <path d="M190 200 l6 12 l6 -12" fill="#E2B54F" />
    </>
  );
}

/**
 * The Indian national flag: 3:2, three equal bands, and the 24-spoke Ashoka
 * Chakra in navy blue at the centre of the white band.
 */
export function FlagArt() {
  const x = 40;
  const y = 54;
  const w = 168;
  const h = 112;
  const band = h / 3;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = band * 0.46; // diameter close to the white band, as the Flag Code describes
  return svg(
    <>
      <rect x="30" y="40" width="6" height="190" rx="3" fill="#E5E7EB" />
      <circle cx="33" cy="38" r="6" fill="#FDE68A" />
      <rect x={x} y={y} width={w} height={band} fill="#FF9933" />
      <rect x={x} y={y + band} width={w} height={band} fill="#FFFFFF" />
      <rect x={x} y={y + band * 2} width={w} height={band} fill="#138808" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#000080" strokeWidth="1.6" />
      <circle cx={cx} cy={cy} r={r * 0.18} fill="#000080" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} stroke="#000080" strokeWidth="0.8" />;
      })}
    </>
  );
}

const HEART = 'M10 18 C 3 12, 0 8, 0 5 C 0 2, 2.5 0, 5 0 C 7 0, 9 1.2, 10 3 C 11 1.2, 13 0, 15 0 C 17.5 0, 20 2, 20 5 C 20 8, 17 12, 10 18 Z';

/** Valentine's Day: a big glowing heart with smaller hearts around it. */
export function HeartArt() {
  return svg(
    <>
      <g transform="translate(40 44) scale(8)" className="festive-glow">
        <path d={HEART} fill="#F43F5E" />
      </g>
      <g transform="translate(62 62) scale(3.2)">
        <path d={HEART} fill="#fff" opacity="0.25" />
      </g>
      {[
        [26, 40, 1.6],
        [196, 52, 1.4],
        [190, 176, 1.8],
        [32, 182, 1.2],
      ].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <path d={HEART} fill={i % 2 ? '#FDA4AF' : '#FDE68A'} />
        </g>
      ))}
    </>
  );
}

/** Mother's and Father's Day: a framed family photo with a heart. */
export function FrameArt() {
  return svg(
    <>
      <rect x="44" y="34" width="152" height="176" rx="6" fill="#7C4A26" />
      <rect x="56" y="46" width="128" height="152" fill="#FDF8F0" />
      <rect x="66" y="56" width="108" height="132" fill="#E9D5BC" />
      {/* a simple family: two adults and a child */}
      <circle cx="98" cy="104" r="14" fill="#8B5E3C" />
      <path d="M76 160 Q98 118 120 160 Z" fill="#B45309" />
      <circle cx="144" cy="100" r="15" fill="#6B4226" />
      <path d="M120 160 Q144 112 168 160 Z" fill="#1E3A5F" />
      <circle cx="121" cy="132" r="10" fill="#A0703F" />
      <path d="M106 168 Q121 138 136 168 Z" fill="#DB2777" />
      <rect x="66" y="160" width="108" height="28" fill="#D6BE9F" />
      <g transform="translate(160 22) scale(2.2)" className="festive-glow">
        <path d={HEART} fill="#F43F5E" />
      </g>
    </>
  );
}

/** Tamil New Year: a pulli kolam (dots joined by one flowing line). */
export function KolamArt() {
  const dots: Array<[number, number]> = [];
  for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) if (Math.abs(r) + Math.abs(c) <= 3) dots.push([120 + c * 32, 120 + r * 32]);
  return svg(
    <>
      <circle cx="120" cy="120" r="104" fill="#FFFBEB" opacity="0.08" />
      <g className="festive-spin-slow">
        {dots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="18" fill="none" stroke="#FFFBEB" strokeWidth="2.5" />
        ))}
        <path d="M120 22 C 170 60, 218 70, 218 120 C 170 170, 170 218, 120 218 C 70 170, 22 170, 22 120 C 70 70, 70 22, 120 22 Z" fill="none" stroke="#FACC15" strokeWidth="3" />
      </g>
      {dots.map(([x, y], i) => (
        <circle key={`d${i}`} cx={x} cy={y} r="3.5" fill="#FFFBEB" />
      ))}
    </>
  );
}

/** Janmashtami: a peacock feather (mor pankh). */
export function PeacockArt() {
  return svg(
    <g transform="rotate(-20 120 120)">
      <path d="M120 226 C 118 160, 120 100, 122 30" stroke="#A3A3A3" strokeWidth="3" fill="none" />
      {Array.from({ length: 26 }, (_, i) => {
        const y = 40 + i * 7;
        const len = 46 - Math.abs(i - 9) * 1.6;
        return (
          <g key={i}>
            <path d={`M121 ${y} q${-len * 0.6} ${-6} ${-len} ${4}`} stroke="#15803D" strokeWidth="1.6" fill="none" opacity="0.85" />
            <path d={`M121 ${y} q${len * 0.6} ${-6} ${len} ${4}`} stroke="#15803D" strokeWidth="1.6" fill="none" opacity="0.85" />
          </g>
        );
      })}
      <ellipse cx="121" cy="84" rx="36" ry="46" fill="#16A34A" />
      <ellipse cx="121" cy="88" rx="26" ry="34" fill="#EAB308" />
      <ellipse cx="121" cy="92" rx="18" ry="24" fill="#0E7490" />
      <ellipse cx="121" cy="96" rx="10" ry="14" fill="#1E3A8A" className="festive-glow" />
    </g>
  );
}
