interface PageIntroProps {
  title: string;
  /**
   * The one line that tells the reader whether this is the page they
   * wanted. Optional — [FE-28] a CMS-authored `Page` doc has no standfirst
   * field of its own (just title + body), so a page rendering from one
   * omits this rather than showing an empty line.
   */
  standfirst?: string;
}

export function PageIntro({ title, standfirst }: PageIntroProps) {
  return (
    <header className="mb-8 pb-6 border-b border-line">
      <h1>{title}</h1>
      {standfirst && <p className="!mb-0 !text-ink/60">{standfirst}</p>}
    </header>
  );
}
