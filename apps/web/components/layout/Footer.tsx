import Link from 'next/link';

const policyLinks = [
  { label: 'About Us', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'FAQ', href: '/faq' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Picture Quality Guide', href: '/picture-quality-guide' },
  { label: 'Terms & Conditions', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Shipping Policy', href: '/shipping-policy' },
  { label: 'Return & Refund Policy', href: '/return-refund-policy' },
];

export function Footer() {
  return (
    <footer className="bg-charcoal text-cream mt-16">
      <div className="max-w-6xl mx-auto px-4 py-10 grid gap-8 md:grid-cols-3">
        <div>
          <h3 className="font-display text-xl mb-3">BroPics</h3>
          <p className="text-sm opacity-80">
            Personalized photo frames, handcrafted from your favourite memories.
          </p>
        </div>

        <nav aria-label="Policy links" className="grid grid-cols-2 gap-2 text-sm">
          {policyLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>

        <form className="text-sm">
          <label htmlFor="newsletter-email" className="block mb-2">
            Sign up for offers &amp; updates
          </label>
          <input
            id="newsletter-email"
            type="email"
            placeholder="Your email address"
            className="w-full rounded-full px-4 py-2 text-charcoal"
          />
        </form>
      </div>
    </footer>
  );
}
