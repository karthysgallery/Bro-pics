import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';
import type { Category } from '@bro-pics/shared';
import { AuthProvider } from '../lib/auth-context';
import { CartProvider } from '../lib/cart-context';
import { ToastProvider } from '../components/ui/Toast';
import { WishlistSync } from '../components/account/WishlistSync';
import { NotificationsSync } from '../components/account/NotificationsSync';
import { LayoutChrome } from '../components/layout/LayoutChrome';
import { getActiveCategories } from '../lib/firestore-categories';
import { getLiveLegalSlugs } from '../lib/firestore-content';
import { getBusinessDetails, getAnnouncementBarSettings, getHeaderSettings, getFooterSettings, getStoreSettings, getThemeSettings, getSeoSettings, getSiteText } from '../lib/firestore-settings';
import { SiteTextProvider } from '../components/layout/SiteTextContext';
import { DEFAULT_SITE_TEXT, type SiteText } from '@bro-pics/shared';
import { resolveActiveTheme, themeCssVariables, type StoreTheme } from '@bro-pics/shared';
import { CANONICAL_ORIGIN } from '../lib/seo/site';
import { getAppearanceSettings } from '../lib/firestore-settings';
import { appearanceCss, DEFAULT_APPEARANCE, type Appearance } from '@bro-pics/shared';
import { NavigationLoader, SplashScreen } from '../components/brand/Preloader';
import { withComboNavLink } from '../lib/combo-nav';
import { BusinessContactProvider, type BusinessContact } from '../lib/business-contact';
import { whatsappDigits } from '@bro-pics/shared';
import { buildOrganizationJsonLd, resolveOgImage } from '../lib/structured-data';
import { Inter, DM_Sans, Poppins, Nunito_Sans, Montserrat, Playfair_Display, Lora, Fraunces, Manrope, Outfit, Dancing_Script, Great_Vibes, Pacifico, Sacramento, Cormorant_Garamond, Cinzel, Caveat, Josefin_Sans } from 'next/font/google';

// One UI typeface for the whole interface. Manrope holds up at the 11–14px
// sizes a dense catalogue runs on, and its open, slightly geometric figures
// keep price-heavy rows legible. The previous Playfair/Inter pairing (serif
// display + sans body) belonged to the older boutique design.
const sansFont = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

// Headlines only. Outfit is wide and geometric — right for signage-sized
// type, wrong for a 13px product title, which is why the body stays Manrope.
const displayFont = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

// The other typefaces the admin can choose for headings/body (Admin > Appearance). `preload: false` keeps them off the
// critical path: a visitor's browser only downloads the one that is actually in use. Manrope/Outfit appear again under
// their own variables so they can be picked for the OTHER role too (e.g. Outfit as body text).
// (next/font needs each loader assigned to its own module-level const.)
const outfitChoice = Outfit({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-outfit', display: 'swap', preload: false });
const manropeChoice = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-manrope', display: 'swap', preload: false });
const interChoice = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap', preload: false });
const dmSansChoice = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap', preload: false });
const poppinsChoice = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-poppins', display: 'swap', preload: false });
const nunitoSansChoice = Nunito_Sans({ subsets: ['latin'], variable: '--font-nunito-sans', display: 'swap', preload: false });
const montserratChoice = Montserrat({ subsets: ['latin'], variable: '--font-montserrat', display: 'swap', preload: false });
const playfairChoice = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair', display: 'swap', preload: false });
const loraChoice = Lora({ subsets: ['latin'], variable: '--font-lora', display: 'swap', preload: false });
const frauncesChoice = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap', preload: false });
const optionalFonts = [outfitChoice, manropeChoice, interChoice, dmSansChoice, poppinsChoice, nunitoSansChoice, montserratChoice, playfairChoice, loraChoice, frauncesChoice]
  .map((font) => font.variable)
  .join(' ');

// Curated set for the personalization editor's text-field font picker
// (mix of script/serif/sans, mirroring the reference site's "Style 1..10"
// swatch grid) — each exposed as its own CSS variable so TextFieldEditor
// can map a font key straight to a `fontFamily` inline style without
// re-declaring @font-face rules of its own.
const dancingScript = Dancing_Script({ subsets: ['latin'], variable: '--font-dancing-script', display: 'swap' });
const greatVibes = Great_Vibes({ subsets: ['latin'], weight: '400', variable: '--font-great-vibes', display: 'swap' });
const pacifico = Pacifico({ subsets: ['latin'], weight: '400', variable: '--font-pacifico', display: 'swap' });
const sacramento = Sacramento({ subsets: ['latin'], weight: '400', variable: '--font-sacramento', display: 'swap' });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-cormorant', display: 'swap' });
const cinzel = Cinzel({ subsets: ['latin'], variable: '--font-cinzel', display: 'swap' });
const caveat = Caveat({ subsets: ['latin'], variable: '--font-caveat', display: 'swap' });
const josefinSans = Josefin_Sans({ subsets: ['latin'], variable: '--font-josefin', display: 'swap' });

const textFieldFontVariables = [
  dancingScript.variable,
  greatVibes.variable,
  pacifico.variable,
  sacramento.variable,
  cormorant.variable,
  cinzel.variable,
  caveat.variable,
  josefinSans.variable,
].join(' ');

const FALLBACK_TITLE = 'KarthysGallery — Personalized Photo Frames';
const FALLBACK_DESCRIPTION = 'Custom photo frames, personalized and delivered.';

/** Site-wide title, description and share image come from Admin > Settings > SEO when set. */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoSettings().catch(() => null);
  // The browser-tab icon the admin chose in Admin > Appearance (a library image); otherwise the default icon.
  const appearance = await getAppearanceSettings().catch(() => DEFAULT_APPEARANCE);
  const faviconUrl = appearance.faviconMediaId ? `/api/media/${encodeURIComponent(appearance.faviconMediaId)}/image` : null;
  const title = seo?.defaultTitle || FALLBACK_TITLE;
  const description = seo?.defaultDescription || FALLBACK_DESCRIPTION;
  const ogImage = resolveOgImage('', seo);
  return {
    metadataBase: new URL(CANONICAL_ORIGIN),
    title,
    description,
    ...(faviconUrl && { icons: { icon: [{ url: `${faviconUrl}?w=64`, sizes: '64x64' }], apple: [{ url: `${faviconUrl}?w=180`, sizes: '180x180' }] } }),
    openGraph: { type: 'website', siteName: 'KarthysGallery', locale: 'en_IN', title, description, ...(ogImage && { images: [ogImage] }) },
    twitter: { card: 'summary_large_image', title, description, ...(ogImage && { images: [ogImage] }) },
    // Proves site ownership to Google Search Console and Bing (Admin > Settings > SEO).
    ...((seo?.googleVerification || seo?.bingVerification) && {
      verification: {
        ...(seo?.googleVerification && { google: seo.googleVerification }),
        ...(seo?.bingVerification && { other: { 'msvalidate.01': seo.bingVerification } }),
      },
    }),
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  let categories: Category[] = [];
  try {
    categories = await getActiveCategories();
  } catch (error) {
    console.error('Failed to load categories for navigation:', error);
  }

  let announcementBar: { text: string; link?: string } | null = null;
  try {
    announcementBar = await getAnnouncementBarSettings();
  } catch (error) {
    console.error('Failed to load announcement bar settings:', error);
  }

  // [FE-27] Header nav extras, footer columns/social links, and the
  // support-phone contact line all fall back to null on either an
  // absent doc or a read error — Header.tsx/Footer.tsx already treat
  // null as "use my own hardcoded defaults", same as announcementBar
  // above.
  let headerSettings: Awaited<ReturnType<typeof getHeaderSettings>> = null;
  try {
    headerSettings = await getHeaderSettings();
  } catch (error) {
    console.error('Failed to load header settings:', error);
  }

  headerSettings = (await withComboNavLink(headerSettings)) as typeof headerSettings;

  let footerSettings: Awaited<ReturnType<typeof getFooterSettings>> = null;
  try {
    footerSettings = await getFooterSettings();
  } catch (error) {
    console.error('Failed to load footer settings:', error);
  }

  let liveLegalSlugs: string[] = [];
  try {
    liveLegalSlugs = await getLiveLegalSlugs();
  } catch (error) {
    console.error('Failed to load legal page status:', error);
  }

  let storeSettings: { name: string; supportPhone: string } | null = null;
  try {
    storeSettings = await getStoreSettings();
  } catch (error) {
    console.error('Failed to load store settings:', error);
  }

  let siteText: SiteText = DEFAULT_SITE_TEXT;
  try {
    siteText = await getSiteText();
  } catch (error) {
    console.error('Failed to load site text:', error);
  }

  // The theme on show now (a festival, or the Everyday look). Its colours are
  // set for the shop only: the admin (data-admin-root) keeps the defaults.
  let theme: StoreTheme | null = null;
  try {
    theme = resolveActiveTheme(await getThemeSettings());
  } catch (error) {
    console.error('Failed to load theme settings:', error);
  }
  let appearance: Appearance = DEFAULT_APPEARANCE;
  try {
    appearance = await getAppearanceSettings();
  } catch (error) {
    console.error('Failed to load appearance settings:', error);
  }
  const appearanceStyles = appearanceCss(appearance);
  const festive = theme && theme.id !== 'default' ? theme : null;
  const themeCss = festive
    ? `:root:not(:has([data-admin-root])){${Object.entries(themeCssVariables(festive.colors))
        .map(([k, v]) => `${k}:${v}`)
        .join(';')}}`
    : '';

  // [FE-41] One Organization entity for the whole site, rendered once
  // here rather than duplicated per page.
  const businessDetails = await getBusinessDetails().catch(() => null);
  const businessContact: BusinessContact = {
    name: businessDetails?.name ?? 'KarthysGallery',
    ...(businessDetails?.supportEmail && { supportEmail: businessDetails.supportEmail }),
    ...(whatsappDigits(businessDetails?.supportWhatsapp) && { whatsappDigits: whatsappDigits(businessDetails?.supportWhatsapp)! }),
    ...((businessDetails?.supportPhone) && { supportPhone: businessDetails.supportPhone }),
  };
  const organizationJsonLd = buildOrganizationJsonLd({ email: businessContact.supportEmail, whatsappDigits: businessContact.whatsappDigits });

  return (
    <html lang="en" className={`${sansFont.variable} ${displayFont.variable} ${optionalFonts} ${textFieldFontVariables}`}>
      <body className="bg-field text-ink font-sans antialiased">
        {appearanceStyles && <style data-appearance dangerouslySetInnerHTML={{ __html: appearanceStyles }} />}
        {themeCss && <style data-theme={festive!.id} dangerouslySetInnerHTML={{ __html: themeCss }} />}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        {appearance.welcomeAnimation && <SplashScreen />}
        <Suspense fallback={null}>
          <NavigationLoader />
        </Suspense>
        <ToastProvider>
          <AuthProvider>
            <WishlistSync />
            <NotificationsSync />
            <CartProvider>
              <SiteTextProvider value={siteText}>
              <BusinessContactProvider value={businessContact}>
              <LayoutChrome
                categories={categories}
                announcementBar={announcementBar}
                headerSettings={headerSettings}
                footerSettings={footerSettings}
                liveLegalSlugs={liveLegalSlugs}
                storeSettings={storeSettings}
                themeDecor={festive?.decor ?? null}
              >
                {children}
              </LayoutChrome>
              </BusinessContactProvider>
              </SiteTextProvider>
            </CartProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
