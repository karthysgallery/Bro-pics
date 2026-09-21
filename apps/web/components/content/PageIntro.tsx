interface PageIntroProps {
  title: string;
  /** The one line that tells the reader whether this is the page they wanted. */
  standfirst: string;
}

export function PageIntro({ title, standfirst }: PageIntroProps) {
  return (
    <header className="mb-8 pb-6 border-b border-line">
      <h1>{title}</h1>
      <p className="!mb-0 !text-ink/60">{standfirst}</p>
    </header>
  );
}
