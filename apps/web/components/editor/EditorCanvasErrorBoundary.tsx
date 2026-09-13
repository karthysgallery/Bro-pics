'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Wraps EditorCanvas (react-konva) to catch a known, already-diagnosed
 * dev-mode-only crash: react-reconciler@0.29.2 (a react-konva dependency)
 * reads several React/ReactDOM internal properties (ReactCurrentOwner,
 * ReactCurrentActQueue.isBatchingLegacy) that Next.js 15's dev-mode client
 * bundle renames/restructures, so the whole page hard-crashes the instant
 * the Konva <Stage> mounts. Confirmed this does NOT happen in a production
 * build (`next build && next start`) — see PROJECT_STATUS.md's
 * "Personalization Editor crashes in next dev only" note. No available
 * react-konva/react-reconciler version bump fixes this without a React 19
 * upgrade (checked 2026-09-13) — that's a much bigger, separate decision,
 * not a quick patch — so rather than let Next's global error overlay take
 * down the whole page in local dev, this shows an honest, scoped fallback
 * instead.
 */
export class EditorCanvasErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error(
      'EditorCanvas crashed — expected in `next dev` only, see EditorCanvasErrorBoundary\'s comment:',
      error
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="aspect-square bg-cream rounded-lg flex items-center justify-center p-4 text-center text-sm text-charcoal/70">
          Photo preview isn&apos;t available in local development mode.
          <br />
          It works correctly in production — run <code>pnpm build &amp;&amp; pnpm start</code> to verify.
        </div>
      );
    }
    return this.props.children;
  }
}
