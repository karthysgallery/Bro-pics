import type { CSSProperties } from 'react';

interface KarthysMarkProps {
  /** 'intro': plays once (frames are drawn, photos develop, name appears). 'loop': keeps gently swinging while something loads. */
  mode?: 'intro' | 'loop';
  /** Show the KARTHYS / GALLERY wordmark under the frames. */
  wordmark?: boolean;
  className?: string;
}

const FRAME = '#7A5834';
const FRAME_LIGHT = '#B08A5E';

/**
 * The KarthysGallery mark, drawn in SVG so it is sharp at any size: two tilted wooden frames, the small one overlapping the large.
 * Animation is plain CSS (see globals.css, `.kl-*`): the frames are drawn stroke by stroke, the photo "develops" in the small
 * frame, a light sweeps across the large one, and the name letters rise in. People who ask for reduced motion see the finished mark.
 */
export function KarthysMark({ mode = 'intro', wordmark = true, className = '' }: KarthysMarkProps) {
  return (
    <div className={`kl ${mode === 'loop' ? 'kl-loop' : ''} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 200 150" className="kl-svg" role="presentation" focusable="false">
        <defs>
          <clipPath id="kl-big-panel"><rect x="-30" y="-38" width="60" height="76" rx="1" /></clipPath>
          <clipPath id="kl-small-panel"><rect x="-18" y="-24" width="36" height="48" rx="1" /></clipPath>
          <linearGradient id="kl-shine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Large frame */}
        <g transform="translate(78 62) rotate(-15)">
          <g className="kl-swing kl-swing-a">
            <rect className="kl-panel kl-panel-big" x="-30" y="-38" width="60" height="76" rx="1" fill="#FFFDF9" />
            <g clipPath="url(#kl-big-panel)">
              <rect className="kl-shine" x="-40" y="-50" width="26" height="100" fill="url(#kl-shine)" transform="skewX(-14)" />
            </g>
            <rect className="kl-draw kl-draw-big" pathLength={1} x="-34" y="-42" width="68" height="84" rx="2" fill="none" stroke={FRAME} strokeWidth="8" />
            <rect className="kl-draw kl-draw-big kl-draw-light" pathLength={1} x="-30.5" y="-38.5" width="61" height="77" rx="1" fill="none" stroke={FRAME_LIGHT} strokeWidth="1.2" />
          </g>
        </g>

        {/* Small frame, in front */}
        <g transform="translate(126 96) rotate(-15)">
          <g className="kl-swing kl-swing-b">
            <rect className="kl-panel kl-panel-small" x="-18" y="-24" width="36" height="48" rx="1" fill="#FFFDF9" />
            <g clipPath="url(#kl-small-panel)" className="kl-photo">
              <rect x="-18" y="-24" width="36" height="48" fill="#F3E4C8" />
              <circle className="kl-sun" cx="6" cy="-8" r="6" fill="#FCA311" />
              <path d="M-18 24 L-18 8 Q-8 -2 2 8 Q10 -1 18 6 L18 24 Z" fill="#7A5834" opacity="0.9" />
            </g>
            <rect className="kl-draw kl-draw-small" pathLength={1} x="-21" y="-27" width="42" height="54" rx="2" fill="none" stroke={FRAME} strokeWidth="6.5" />
            <rect className="kl-draw kl-draw-small kl-draw-light" pathLength={1} x="-18.3" y="-24.3" width="36.6" height="48.6" rx="1" fill="none" stroke={FRAME_LIGHT} strokeWidth="1" />
          </g>
        </g>
      </svg>

      {wordmark && (
        <div className="kl-word">
          <span className="kl-name">
            {'KARTHYS'.split('').map((letter, i) => (
              <span key={i} style={{ '--i': i } as CSSProperties}>{letter}</span>
            ))}
          </span>
          <span className="kl-sub">GALLERY</span>
        </div>
      )}
    </div>
  );
}
