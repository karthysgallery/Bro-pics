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
        if (effect === 'lanterns') {
          // Sky lanterns drifting up with a warm glow.
          return (
            <span key={i} className="festive-rise absolute -bottom-16" style={{ ...common, animationDuration: `${p.duration * 1.6}s` }}>
              <svg width={p.size * 2} height={p.size * 2.6} viewBox="0 0 20 26">
                <ellipse cx="10" cy="13" rx="10" ry="12" fill="#FDE68A" opacity="0.25" />
                <path d="M4 4 Q10 1 16 4 L14.5 20 Q10 22 5.5 20 Z" fill="#F59E0B" opacity="0.85" />
                <path d="M6 6 Q10 4 14 6 L13 18 Q10 19.5 7 18 Z" fill="#FCD34D" opacity="0.8" />
                <circle cx="10" cy="19" r="1.4" fill="#FFF7D6" />
              </svg>
            </span>
          );
        }
        if (effect === 'fireworks') {
          const colors = ['#FACC15', '#F472B6', '#60A5FA', 'rgb(var(--color-gold))'];
          return (
            <svg key={i} className="festive-burst absolute" viewBox="-20 -20 40 40" style={{ left: `${p.left}%`, top: `${(p.left * 13) % 60 + 4}%`, width: p.size * 6, height: p.size * 6, animationDelay: `${p.delay}s`, animationDuration: `${3 + (p.duration % 3)}s` }}>
              {Array.from({ length: 12 }, (_, k) => {
                const a = (k / 12) * Math.PI * 2;
                return <line key={k} x1={Math.cos(a) * 5} y1={Math.sin(a) * 5} x2={Math.cos(a) * 17} y2={Math.sin(a) * 17} stroke={colors[p.hue]} strokeWidth="1.6" strokeLinecap="round" />;
              })}
            </svg>
          );
        }
        if (effect === 'colors') {
          // Soft clouds of Holi colour drifting down.
          const gulal = ['#EC4899', '#22C55E', '#F59E0B', '#3B82F6', '#A855F7'];
          return <span key={i} className="festive-fall absolute -top-10 rounded-full blur-md" style={{ ...common, width: p.size * 4, height: p.size * 4, background: gulal[i % gulal.length], opacity: 0.35 }} />;
        }
        if (effect === 'hearts') {
          return (
            <svg key={i} className="festive-rise absolute -bottom-10" style={{ ...common, width: p.size * 1.6, height: p.size * 1.5 }} viewBox="0 0 20 19">
              <path d="M10 18 C 3 12, 0 8, 0 5 C 0 2, 2.5 0, 5 0 C 7 0, 9 1.2, 10 3 C 11 1.2, 13 0, 15 0 C 17.5 0, 20 2, 20 5 C 20 8, 17 12, 10 18 Z" fill={i % 2 ? 'rgb(var(--color-accent) / 0.55)' : 'rgb(244 63 94 / 0.5)'} />
            </svg>
          );
        }
        if (effect === 'snow') {
          // White flakes with a soft shadow, so they show on a light page too.
          return <span key={i} className="festive-fall absolute -top-4 rounded-full bg-white" style={{ ...common, width: p.size * 0.75, height: p.size * 0.75, boxShadow: '0 0 3px rgb(var(--color-accent) / 0.35)' }} />;
        }
        if (effect === 'petals') {
          return <span key={i} className="festive-fall absolute -top-4" style={{ ...common, width: p.size, height: p.size * 0.6, borderRadius: '60% 0 60% 0', background: i % 2 ? 'rgb(var(--color-gold) / 0.75)' : 'rgb(var(--color-gold-deep) / 0.6)' }} />;
        }
        return <span key={i} className="festive-fall absolute -top-4" style={{ ...common, width: p.size * 0.5, height: p.size, background: confetti[p.hue], opacity: 0.55 }} />;
      })}
    </div>
  );
}
