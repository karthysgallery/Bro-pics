import Link from 'next/link';

const categoryLinks = [
  { label: 'Shop all', href: '/category' },
  { label: 'Frames & Wall Décor', href: '/category/frames-wall-decor' },
  { label: 'Best sellers', href: '/#best-sellers' },
  { label: 'New arrivals', href: '/#newly-dropped' },
];

const legalLinks = [
  { label: 'Terms & conditions', href: '/terms' },
  { label: 'Privacy policy', href: '/privacy' },
  { label: 'Shipping policy', href: '/shipping-policy' },
  { label: 'Return & refund policy', href: '/return-refund-policy' },
];

const helpLinks = [
  { label: 'About us', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'FAQ', href: '/faq' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Picture quality guide', href: '/picture-quality-guide' },
];

const accountLinks = [
  { label: 'My orders', href: '/orders' },
  { label: 'Wishlist', href: '/account/wishlist' },
  { label: 'Saved addresses', href: '/account/addresses' },
  { label: 'Profile', href: '/account' },
];

// Named rather than drawn as logos — the real card marks are trademarked art
// we do not have licensed files for, and a row of wordmarks is honest.
const PAYMENT_METHODS = ['UPI', 'Visa', 'Mastercard', 'RuPay', 'Net banking', 'Cash on delivery'];

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="text-2xs font-bold uppercase tracking-wider text-gold mb-3">{title}</h4>
      <ul className="space-y-2 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-paper/65 hover:text-gold transition-colors">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="bg-ink text-paper mt-12">
      <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-10 grid grid-cols-2 md:grid-cols-5 gap-8">
        <div className="col-span-2 md:col-span-1">
          <h3 className="text-lg font-bold text-gold mb-2">BroPics</h3>
          <p className="text-sm text-paper/65 mb-4">
            Personalized photo frames, printed and delivered across India.
          </p>
          <form className="text-sm">
            <label htmlFor="newsletter-email" className="block mb-2 text-paper/70">
              Get new arrivals and offers
            </label>
            <div className="flex gap-2">
              <input
                id="newsletter-email"
                type="email"
                placeholder="Email address"
                className="flex-1 min-w-0 rounded-md px-3 py-2 border border-paper/25 bg-transparent text-paper placeholder:text-paper/40"
              />
              <button
                type="submit"
                className="rounded-full bg-gold text-ink px-3.5 py-2 text-sm font-semibold shrink-0 hover:bg-gold-deep transition-colors"
              >
                Sign up
              </button>
            </div>
          </form>
        </div>

        <FooterColumn title="Shop" links={categoryLinks} />
        <FooterColumn title="Help" links={helpLinks} />
        <FooterColumn title="Account" links={accountLinks} />
        <FooterColumn title="Legal" links={legalLinks} />
      </div>

      <div className="border-t border-paper/15">
        <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-4 flex flex-wrap items-center gap-x-2 gap-y-2">
          <span className="text-2xs text-paper/50 mr-1">We accept</span>
          {PAYMENT_METHODS.map((method) => (
            <span
              key={method}
              className="rounded border border-paper/25 px-2 py-1 text-2xs font-medium text-paper/75"
            >
              {method}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-paper/15">
        <div className="mx-auto w-full max-w-shell px-4 md:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-2xs text-paper/50">
          <span>© {new Date().getFullYear()} BroPics. All rights reserved.</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-gold transition-colors">Instagram</a>
            <a href="#" className="hover:text-gold transition-colors">Facebook</a>
            <a href="#" className="hover:text-gold transition-colors">WhatsApp</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
