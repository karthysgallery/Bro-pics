import { SUPPORT_EMAIL } from '../../lib/support-contact';

interface HelpCalloutProps {
  whatsappHref: string;
}

// Boxed support callout, replacing BuyBox's old single inline WhatsApp text
// link — matches the visual weight of BuyBox's trust-points strip
// immediately below it, giving support contact the same prominence the
// reference site gives it.
export function HelpCallout({ whatsappHref }: HelpCalloutProps) {
  return (
    <div className="mt-3 rounded-2xl bg-tint p-4 text-center sm:flex sm:items-center sm:justify-center sm:gap-4 sm:text-left">
      <p className="text-xs text-ink/70 mb-2 sm:mb-0">Need help uploading or personalizing?</p>
      <div className="flex items-center justify-center gap-3 text-sm font-medium">
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-dark">
          WhatsApp us
        </a>
        <span className="text-line" aria-hidden="true">|</span>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:text-accent-dark">
          {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  );
}
