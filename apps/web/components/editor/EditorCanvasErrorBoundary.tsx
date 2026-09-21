'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Wraps EditorCanvas as a generic safety net — a failure here (a corrupt
 * image, an unexpected canvas API error) shows a scoped, honest fallback
 * instead of taking down the whole product page via Next's global error
 * overlay. EditorCanvas itself no longer depends on react-konva/
 * react-reconciler (replaced with plain <canvas> + native Image() — see
 * PROJECT_STATUS.md's "react-konva removed" note), which is what used to
 * make this boundary trip on every mount; it should now rarely fire.
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
        <div className="aspect-square bg-paper rounded-lg flex items-center justify-center p-4 text-center text-sm text-ink/70">
          Photo preview isn&apos;t available in local development mode.
          <br />
          It works correctly in production — run <code>pnpm build &amp;&amp; pnpm start</code> to verify.
        </div>
      );
    }
    return this.props.children;
  }
}
