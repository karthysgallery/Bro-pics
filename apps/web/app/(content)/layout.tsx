import type { ReactNode } from 'react';

/**
 * The written-page shell. Content pages are read, not scanned, so they get a
 * single narrow measure (~70 characters) instead of the catalogue's 1280px
 * shell, and the prose rhythm is set once here rather than per page.
 */
export default function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="w-full">
      <article
        className="
          text-ink
          [&_h1]:font-display [&_h1]:text-3xl md:[&_h1]:text-5xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:mb-3
          [&_h2]:font-display [&_h2]:text-xl md:[&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3
          [&_h3]:font-display [&_h3]:text-base md:[&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2
          [&_p]:text-sm md:[&_p]:text-base [&_p]:leading-relaxed [&_p]:text-ink/80 [&_p]:mb-4
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4
          [&_li]:text-sm md:[&_li]:text-base [&_li]:leading-relaxed [&_li]:text-ink/80 [&_li]:mb-1.5
          [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2
          [&_strong]:font-bold [&_strong]:text-ink
        "
      >
        {children}
      </article>
    </div>
  );
}
