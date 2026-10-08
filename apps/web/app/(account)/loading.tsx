// Skeleton shaped like the catalogue rows it replaces, so the page does not
// jump when the real content arrives. Static rather than animated: a pulsing
// grid of ten tiles is more distracting than a still one.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-8" aria-busy="true" aria-label="Loading">
      <div className="h-[220px] sm:h-[300px] lg:h-[360px] rounded-lg bg-tint" />
      <div className="mt-8 h-6 w-48 rounded bg-tint" />
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-7">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i}>
            <div className="aspect-square rounded-lg bg-tint" />
            <div className="mt-2 h-3 w-4/5 rounded bg-tint" />
            <div className="mt-1.5 h-3 w-1/3 rounded bg-tint" />
          </div>
        ))}
      </div>
    </div>
  );
}
