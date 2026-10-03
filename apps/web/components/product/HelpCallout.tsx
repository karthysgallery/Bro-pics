import { SUPPORT_EMAIL } from '../../lib/support-contact';

interface HelpCalloutProps {
  whatsappHref: string;
}

export function HelpCallout({ whatsappHref }: HelpCalloutProps) {
  return (
    <div className="mt-4 rounded-2xl bg-[#F5EFEA]/80 border border-line/60 p-3.5 sm:p-4 text-ink">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-5 h-5 rounded-full bg-gold/40 text-ink flex items-center justify-center text-[11px] shrink-0 font-bold">
          ?
        </span>
        <p className="text-xs font-medium text-ink/80">
          Need help uploading or personalizing?
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-paper/90 border border-line/80 text-ink text-xs font-semibold hover:border-accent hover:text-accent hover:bg-paper transition-all shadow-2xs"
          aria-label="WhatsApp us"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          <span>WhatsApp us</span>
        </a>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-paper/90 border border-line/80 text-ink/90 text-xs font-medium hover:border-accent hover:text-accent hover:bg-paper transition-all shadow-2xs"
          aria-label={SUPPORT_EMAIL}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <span>{SUPPORT_EMAIL}</span>
        </a>
      </div>
    </div>
  );
}
