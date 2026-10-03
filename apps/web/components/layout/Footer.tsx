import Link from 'next/link';

interface FooterProps {
  // [FE-27] From settings/footer (ABE-24's write API had no reader until
  // now). Replaces the four hardcoded FooterColumn defs below AND the
  // hardcoded social-links row when an admin has actually configured it.
  settings?: {
    columns: { title: string; links: { label: string; href: string }[] }[];
    socialLinks: { platform: string; url: string }[];
  } | null;
  // [FE-27] From settings/store — shown as a contact line in the brand
  // column when an admin has set one.
  supportPhone?: string;
}

const categoryLinks = [
  { label: 'Photo frames', href: '/category/frames-wall-decor' },
  { label: 'Gallery sets', href: '/category' },
  { label: 'Gift frames', href: '/#best-sellers' },
];

const discoverLinks = [
  { label: 'Our story', href: '/about' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Quality guide', href: '/picture-quality-guide' },
];

const supportLinks = [
  { label: 'Track your order', href: '/orders' },
  { label: 'Contact & FAQ', href: '/faq' },
  { label: 'Returns & policies', href: '/return-refund-policy' },
];

// Figma footer columns: Shop | Discover | Support
// Legacy defaults used when settings is null (also tested by Footer.test.tsx)
const legacyCategoryLinks = [
  { label: 'Shop all', href: '/category' },
  { label: 'Frames & Wall Décor', href: '/category/frames-wall-decor' },
  { label: 'Best sellers', href: '/#best-sellers' },
  { label: 'New arrivals', href: '/#newly-dropped' },
];

const legacyLegalLinks = [
  { label: 'Terms & conditions', href: '/terms' },
  { label: 'Privacy policy', href: '/privacy' },
  { label: 'Shipping policy', href: '/shipping-policy' },
  { label: 'Return & refund policy', href: '/return-refund-policy' },
];

const legacyHelpLinks = [
  { label: 'About us', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'FAQ', href: '/faq' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Picture quality guide', href: '/picture-quality-guide' },
];

const legacyAccountLinks = [
  { label: 'My orders', href: '/orders' },
  { label: 'Wishlist', href: '/account/wishlist' },
  { label: 'Saved addresses', href: '/account/addresses' },
  { label: 'Profile', href: '/account' },
];

// Named rather than drawn as logos — the real card marks are trademarked art
// we do not have licensed files for, and a row of wordmarks is honest.
const PAYMENT_METHODS = ['UPI', 'Visa', 'Mastercard', 'Net banking'];

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="text-sm font-bold text-ink mb-4 tracking-wide">{title}</h4>
      <ul className="space-y-2.5 text-[13px]">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-ink/60 hover:text-ink transition-colors">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer({ settings = null, supportPhone }: FooterProps = {}) {
  const columns =
    settings && settings.columns.length > 0
      ? settings.columns
      : [
          { title: 'Shop', links: legacyCategoryLinks },
          { title: 'Discover', links: legacyHelpLinks },
          { title: 'Support', links: legacyLegalLinks },
          { title: 'Account', links: legacyAccountLinks },
        ];
  const socialLinks =
    settings && settings.socialLinks.length > 0
      ? settings.socialLinks
      : [
          { platform: 'Instagram', url: '#' },
          { platform: 'Pinterest', url: '#' },
          { platform: 'WhatsApp', url: '#' },
        ];

  return (
    <footer className="bg-[#FAF8F4] text-ink mt-16 border-t border-line">
      <div className="mx-auto w-full max-w-shell px-4 md:px-8 py-12 md:py-14 grid grid-cols-2 md:grid-cols-6 gap-8 md:gap-6 lg:gap-10">
        {/* Brand column */}
        <div className="col-span-2 md:col-span-2">
          <h3 className="text-xl font-bold font-display text-ink mb-2">KarthysGallery</h3>
          <p className="text-[13px] text-ink/60 mb-5 leading-relaxed max-w-[260px]">
            Your photos. Beautifully framed. Crafted in India, for the moments that matter.
          </p>
          {supportPhone && <p className="text-xs text-ink/70 mb-3 font-medium">Call us: {supportPhone}</p>}
          <div className="flex items-center gap-3 text-[13px] text-ink/60 mb-5">
            {socialLinks.map((social) => (
              <a key={social.platform} href={social.url} className="hover:text-ink transition-colors">
                {social.platform}
              </a>
            ))}
            <span className="text-ink/40">·</span>
            <span className="text-ink/50">hello@karthysgallery.in</span>
          </div>
          <form className="text-xs">
            <div className="flex gap-2">
              <input
                id="newsletter-email"
                type="email"
                placeholder="Email address"
                className="flex-1 min-w-0 rounded-full px-3.5 py-1.5 border border-line bg-paper text-ink text-xs placeholder:text-ink/40 focus:outline-none focus:border-ink"
              />
              <button
                type="submit"
                className="rounded-full bg-gold text-ink px-4 py-1.5 text-xs font-semibold shrink-0 hover:bg-gold-deep transition-colors"
              >
                Sign up
              </button>
            </div>
          </form>
        </div>

        {/* Link columns */}
        {columns.map((column) => (
          <FooterColumn key={column.title} title={column.title} links={column.links} />
        ))}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-line/60">
        <div className="mx-auto w-full max-w-shell px-4 md:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-center sm:text-left text-[11px] text-ink/50">
          <span>© {new Date().getFullYear()} KarthysGallery · Privacy · Terms · Made in India</span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {PAYMENT_METHODS.map((method, i) => (
              <span key={method} className="flex items-center">
                <span className="text-ink/50">{method}</span>
                {i < PAYMENT_METHODS.length - 1 && <span className="text-ink/30 ml-2">/</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}


