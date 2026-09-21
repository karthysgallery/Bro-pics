import type { ReactNode } from 'react';

/**
 * The written-page shell. Content pages are read, not scanned, so they get a
 * single narrow measure (~70 characters) instead of the catalogue's 1280px
 * shell, and the prose rhythm is set once here rather than per page.
 */
export default function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[42rem] px-4 md:px-6 py-10 md:py-14">
      <article
        className="
          text-ink
          [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:mb-2
          [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-9 [&_h2]:mb-2
          [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-1
          [&_p]:text-[15px] [&_p]:leading-relaxed [&_p]:text-ink/80 [&_p]:mb-4
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4
          [&_li]:text-[15px] [&_li]:leading-relaxed [&_li]:text-ink/80 [&_li]:mb-1.5
          [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2
          [&_strong]:font-semibold [&_strong]:text-ink
        "
      >
        {children}
      </article>
    </div>
  );
}
