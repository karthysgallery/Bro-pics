import Link from 'next/link';

interface FooterProps {
  settings?: {
    columns: { title: string; links: { label: string; href: string }[] }[];
    socialLinks: { platform: string; url: string }[];
    tagline?: string;
  } | null;
  supportPhone?: string;
}

export const DEFAULT_FOOTER_LINKS = [
  { label: 'About us', href: '/about' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
  { label: 'Shipping policy', href: '/shipping-policy' },
  { label: 'Return & refund policy', href: '/return-refund-policy' },
  { label: 'Privacy policy', href: '/privacy' },
  { label: 'Terms & conditions', href: '/terms' },
];

/**
 * A single quiet strip: name, the links people actually look for, and
 * social profiles that really exist. Admin-managed columns are flattened
 * into the same row (duplicates dropped) so the footer stays short however
 * many groups the CMS defines.
 */
export function Footer({ settings = null, supportPhone }: FooterProps = {}) {
  const links =
    settings && settings.columns.length > 0
      ? settings.columns
          .flatMap((column) => column.links)
          .filter((link, i, all) => all.findIndex((other) => other.href === link.href) === i)
      : DEFAULT_FOOTER_LINKS;

  // A placeholder "#" is not a profile; showing it would be a dead link.
  const socialLinks = (settings?.socialLinks ?? []).filter((s) => s.url && s.url !== '#');

  return (
    <footer className="mt-6 md:mt-10 border-t border-line bg-field text-ink">
      <div className="mx-auto w-full max-w-shell px-4 md:px-8 py-8 md:py-10 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Link href="/" className="font-display text-lg font-bold leading-none tracking-snug">
              KarthysGallery
            </Link>
            <p className="mt-2 text-[13px] text-ink/55">{settings?.tagline ?? 'Your photos, beautifully framed. Made in India.'}</p>
          </div>

          {(socialLinks.length > 0 || supportPhone) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink/60">
              {supportPhone && (
                <a href={`tel:${supportPhone}`} className="font-medium text-ink hover:text-accent transition-colors">
                  {supportPhone}
                </a>
              )}
              {socialLinks.map((social) => (
                <a
                  key={social.platform}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-ink transition-colors"
                >
                  {social.platform}
                </a>
              ))}
            </div>
          )}
        </div>

        <nav aria-label="Footer" className="border-t border-line/60 pt-5">
          <ul className="flex flex-wrap gap-x-5 gap-y-0 text-[13px] text-ink/60">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-ink transition-colors">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="text-[12px] text-ink/45">&copy; {new Date().getFullYear()} KarthysGallery. All rights reserved.</p>
      </div>
    </footer>
  );
}
