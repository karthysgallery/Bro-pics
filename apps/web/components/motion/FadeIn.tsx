'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

// On-load fade + slide-up for first-impression content (the hero). Plain
// CSS transition rather than a JS animation library — driven entirely by
// the browser's own compositor, so it can't get stuck waiting on a
// requestAnimationFrame loop the way an imperative animation driver can.
// motion-reduce: (Tailwind's built-in prefers-reduced-motion variant)
// disables the transition for users who've asked for it — no JS check needed.
export function FadeIn({ children, delay = 0, className = '' }: FadeInProps) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // A short setTimeout, not requestAnimationFrame — this only needs to
    // run after the initial "hidden" state paints once, and setTimeout
    // fires reliably via the JS event loop regardless of whether the
    // browser's compositor is actively ticking rAF callbacks (some
    // automated/headless browser contexts suspend rAF between explicit
    // paints, which would otherwise leave this stuck at its initial state).
    const id = setTimeout(() => setShown(true), 20);
    return () => clearTimeout(id);
  }, []);

  return (
    <div
      className={`motion-reduce:!opacity-100 motion-reduce:!translate-y-0 transition-all duration-700 ease-out ${
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      } ${className}`}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}
