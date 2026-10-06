'use client';

import { useEffect, useState } from 'react';
import type { ThemeDecor } from '@bro-pics/shared';

interface Particle {
  left: number;
  delay: number;
  duration: number;
  size: number;
  drift: number;
  hue: number;
}

const COUNT = 16;

/**
 * A light festive animation over the page (sparkles, snow, petals or
 * confetti). Few particles, never blocks clicks, and skipped entirely for
 * visitors whose device asks for reduced motion. Positions are picked after
 * mount so the server and browser render the same HTML.
 */
export function FestiveEffect({ effect }: { effect: ThemeDecor['effect'] }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (effect === 'none') return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setParticles(
      Array.from({ length: COUNT }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 12,
        duration: 9 + Math.random() * 8,
        size: 6 + Math.random() * 8,
        drift: (Math.random() - 0.5) * 80,
        hue: Math.floor(Math.random() * 4),
      }))
    );
  }, [effect]);

  if (effect === 'none' || particles.length === 0) return null;

  const confetti = ['rgb(var(--color-gold))', 'rgb(var(--color-accent))', 'rgb(var(--color-gold-deep))', 'rgb(var(--color-accent-dark))'];

  return (
    <div aria-hidden="true" className="festive-effect pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {particles.map((p, i) => {
        const common = {
          left: `${p.left}%`,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
          ['--drift' as string]: `${p.drift}px`,
        };
        if (effect === 'sparkles') {
          return (
            <svg key={i} className="festive-twinkle absolute" style={{ ...common, top: `${(p.left * 7) % 90}%`, width: p.size * 1.6, height: p.size * 1.6 }} viewBox="0 0 10 10">
              <path d="M5 0 Q5.6 4.4 10 5 Q5.6 5.6 5 10 Q4.4 5.6 0 5 Q4.4 4.4 5 0 Z" fill="rgb(var(--color-gold))" />
            </svg>
          );
        }
        if (effect === 'snow') {
          return <span key={i} className="festive-fall absolute -top-4 rounded-full" style={{ ...common, width: p.size * 0.7, height: p.size * 0.7, background: 'rgb(var(--color-accent) / 0.18)' }} />;
        }
        if (effect === 'petals') {
          return <span key={i} className="festive-fall absolute -top-4" style={{ ...common, width: p.size, height: p.size * 0.6, borderRadius: '60% 0 60% 0', background: i % 2 ? 'rgb(var(--color-gold) / 0.75)' : 'rgb(var(--color-gold-deep) / 0.6)' }} />;
        }
        return <span key={i} className="festive-fall absolute -top-4" style={{ ...common, width: p.size * 0.5, height: p.size, background: confetti[p.hue], opacity: 0.55 }} />;
      })}
    </div>
  );
}
