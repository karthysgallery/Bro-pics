interface SkeletonProps {
  className?: string;
}

// A single placeholder block — compose these for a page's own skeleton
// shape (see PageSkeleton below for the common "loading a form/list" case).
// Static, not animated: matches app/loading.tsx's existing choice not to
// pulse, so nothing about the loading treatment changes between the one
// route-level skeleton and every page-level one built from this.
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`bg-tint rounded-md ${className}`} aria-hidden="true" />;
}

interface PageSkeletonProps {
  /** How many list rows to draw. Omit for a plain block skeleton. */
  rows?: number;
  className?: string;
}

// The single replacement for the six-plus different ad hoc "Loading…" `<p>`
// implementations found across account/admin pages — a page opts in with
// one line instead of writing its own text and styling.
export function PageSkeleton({ rows, className = '' }: PageSkeletonProps) {
  return (
    <div className={`mx-auto w-full max-w-shell px-4 md:px-6 py-12 flex flex-col gap-3 ${className}`} role="status" aria-label="Loading">
      <Skeleton className="h-6 w-48" />
      {rows
        ? Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)
        : <Skeleton className="h-40 w-full" />}
    </div>
  );
}
