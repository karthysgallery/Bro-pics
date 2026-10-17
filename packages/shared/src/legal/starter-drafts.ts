import type { LegalToken } from '../business/legal-text';
import { LEGAL_PAGE_SLUGS } from '../business/legal-text';

/**
 * Starter text for the shop's legal and policy pages. These are DRAFTS for the owner to read, edit and
 * approve, prepared for a made-to-order photo-frame shop; they are not legal advice and have not been
 * reviewed by a lawyer. Every business fact is a {{token}} filled from the owner's saved details: a page
 * whose tokens are not all filled cannot be published, so nothing here can reach customers with an
 * invented address, number, deadline or promise. Have the final text checked by a professional familiar
 * with Indian consumer-protection, e-commerce, IT/privacy and tax rules before you approve it.
 */

export interface StarterDraft {
  slug: (typeof LEGAL_PAGE_SLUGS)[number];
  title: string;
  /** Tokens this draft needs; the editor lists any still missing. */
  tokens: LegalToken[];
  bodyHtml: string;
}

const privacy: StarterDraft = {
  slug: 'privacy',
  title: 'Privacy policy',
  tokens: ['businessName', 'legalName', 'address', 'supportEmail', 'photoRetention', 'grievanceName', 'grievanceDesignation', 'grievanceEmail', 'responseTime'],
  bodyHtml: `
<p>This policy explains what {{legalName}} ("we", "us", trading as {{businessName}}) collects when you use our website, why we collect it, who sees it and the choices you have.</p>
<h2>Who we are</h2>
<p>{{legalName}}, {{address}}. Write to us at {{supportEmail}}.</p>
<h2>What we collect</h2>
<ul>
<li><strong>Your mobile number.</strong> It is how you sign in. We send a one-time code to it on WhatsApp.</li>
<li><strong>Delivery addresses and names</strong> you enter, so we can deliver your order.</li>
<li><strong>Photographs and text you upload</strong> to personalise a product, and the previews made from them.</li>
<li><strong>Order, payment-status and invoice records.</strong> We do not see or store your card, UPI PIN or bank login: payments are handled by our payment provider.</li>
<li><strong>Messages you send us</strong> about an order, such as claims and the photos or videos you share with them.</li>
<li><strong>Basic technical data</strong> your browser sends, and small items saved in your browser (your cart, wishlist and recently viewed products) so the site works between visits.</li>
</ul>
<h2>Why we use it</h2>
<p>To let you sign in, make and deliver your order, issue invoices, answer your questions and claims, keep the website secure, and meet legal and accounting duties. We use your uploaded photographs only to make and check your order and to deal with any claim about it.</p>
<h2>Who receives it</h2>
<p>Only the services needed to run the shop: our website hosting and database provider (Google), WhatsApp (Meta) to deliver one-time codes, our payment provider (Razorpay), and the courier that delivers your parcel, which receives your name, address and phone number. We do not sell your personal data.</p>
<h2>How long we keep it</h2>
<p>{{photoRetention}} Order and invoice records are kept for as long as the law requires.</p>
<h2>Your choices</h2>
<p>You may ask us for a copy of the personal data we hold about you, to correct it, or to delete it (records we are legally required to keep cannot be deleted). Write to {{supportEmail}}. {{responseTime}}</p>
<h2>Security</h2>
<p>Your uploads are stored privately and are not open to other customers. No system is perfectly secure, so please keep access to your mobile number protected.</p>
<h2>Grievances</h2>
<p>If you have a concern about how your data is handled, contact our grievance contact: {{grievanceName}}, {{grievanceDesignation}}, {{grievanceEmail}}.</p>
<h2>Changes</h2>
<p>We may update this policy. The version published on this page is the one that applies.</p>`,
};

const terms: StarterDraft = {
  slug: 'terms',
  title: 'Terms and conditions',
  tokens: ['businessName', 'legalName', 'address', 'supportEmail', 'jurisdiction'],
  bodyHtml: `
<p>These terms apply when you use our website and place an order with {{legalName}} (trading as {{businessName}}), {{address}}.</p>
<h2>Our products</h2>
<p>We make photo frames and prints to order. Some products are made from your photographs or text ("personalised products"); others are ready-made designs. The product page tells you which kind you are buying.</p>
<h2>Your account</h2>
<p>You sign in with your mobile number and a one-time code sent on WhatsApp. Anyone who can receive your codes can use your account, so keep your number and phone secure.</p>
<h2>Your photographs and text</h2>
<p>You keep ownership of everything you upload. You allow us to store, process and print it only to make and deliver your order. You confirm that you have the right to use it and that it does not infringe anyone's rights or privacy. We may decline content that is unlawful, harmful, or that appears to infringe someone else's rights, and if we decline an order for that reason we will refund it.</p>
<h2>Previews</h2>
<p>The preview on the website shows how your design will look. Printed colours can differ slightly from a screen, and natural materials vary. Please check the preview, your photo and your text carefully before you pay: personalised products are made exactly as you approve them.</p>
<h2>Prices and payment</h2>
<p>Prices are in Indian rupees. The total, including shipping, is shown before you pay. Payment is taken through Razorpay. If a price was published by mistake we will tell you before making your order, and you may cancel for a full refund.</p>
<h2>Orders, shipping and delivery</h2>
<p>See our Shipping and delivery policy. Dispatch and delivery times are estimates.</p>
<h2>Cancellations, returns and refunds</h2>
<p>See our Cancellation policy and our Returns, replacement and refund policy. Nothing in these terms limits any right you have under applicable consumer-protection law.</p>
<h2>Using the website</h2>
<p>Please do not misuse the website, attempt to interfere with it, or use it unlawfully.</p>
<h2>Liability</h2>
<p>If a product is faulty because of us, we will put it right as described in our returns policy. We are not responsible for losses we could not reasonably have foreseen. Nothing here excludes liability that cannot lawfully be excluded.</p>
<h2>Changes</h2>
<p>We may update these terms. The version published here when you place your order applies to that order.</p>
<h2>Governing law</h2>
<p>These terms are governed by the laws of India. {{jurisdiction}} Contact us at {{supportEmail}}.</p>`,
};

const shipping: StarterDraft = {
  slug: 'shipping-policy',
  title: 'Shipping and delivery policy',
  tokens: ['shippingSummary', 'dispatchTime', 'deliveryEstimate', 'supportEmail', 'supportWhatsapp'],
  bodyHtml: `
<p>This page explains how and when we deliver your order.</p>
<h2>Shipping charges</h2>
<p>{{shippingSummary}}</p>
<h2>Making and dispatch</h2>
<p>Every item is made to order. {{dispatchTime}}</p>
<h2>Delivery time</h2>
<p>{{deliveryEstimate}} Times are estimates and can be affected by the courier, weather, local holidays and remote locations.</p>
<h2>Tracking</h2>
<p>When your parcel is dispatched, tracking details are added to your order page where available.</p>
<h2>Delivery address</h2>
<p>We deliver to the address you confirm at checkout. Please check the address and PIN code carefully. If you need to change it, contact us as early as possible, before the order is dispatched.</p>
<h2>Parcels not delivered</h2>
<p>If your parcel is delayed, or marked delivered but you have not received it, contact us on WhatsApp {{supportWhatsapp}} or at {{supportEmail}} and we will look into it with the courier.</p>
<h2>Damaged on arrival</h2>
<p>Please see our Returns, replacement and refund policy for what to do if your parcel arrives damaged.</p>`,
};

const returns: StarterDraft = {
  slug: 'return-refund-policy',
  title: 'Returns, replacement and refund policy',
  tokens: ['claimWindowDays', 'readyMadeReturnDays', 'claimInstructions', 'refundTiming', 'supportEmail', 'supportWhatsapp', 'responseTime'],
  bodyHtml: `
<p>We want you to be happy with your order. This page explains what happens if something is wrong, and what we cannot take back. Nothing on this page limits any right you have under applicable consumer-protection law.</p>
<h2>Personalised products</h2>
<p>A personalised product is made from your photograph or text and cannot be sold to anyone else. We therefore cannot accept a return or give a refund only because you changed your mind, or because you chose a different photo, text, size or design after it was made. Please check the preview and your details carefully before you pay.</p>
<h2>Ready-made products</h2>
<p>Ready-made designs (for example actor-themed or devotional frames) that are not personalised are handled separately. You may ask to return an unused ready-made product within {{readyMadeReturnDays}} days of delivery, subject to the condition in which it is returned.</p>
<h2>Damaged, defective or wrong items</h2>
<p>If your item arrives damaged, has a printing or manufacturing defect, is not what you ordered, or does not match the preview you approved, tell us. This applies to every product, personalised or not, and we will review it fairly.</p>
<p>When the problem is our responsibility, our usual remedy is to make and send a replacement frame or a corrected product. Refunds and other remedies are handled according to the law and how you paid.</p>
<h2>How to raise a claim</h2>
<p>Please tell us within {{claimWindowDays}} days of delivery. {{claimInstructions}}</p>
<p>To help us check quickly, please keep the packing and, if you can, record one continuous, uncut video while you open the parcel. The video should show the parcel and its shipping label, the sealed package, the package being opened without a break, the frame and artwork being taken out, and the problem. A video is a help, not a condition: if you do not have one, we will still look at your photographs and what you tell us and decide fairly.</p>
<p>Send us your order number, clear photographs of the problem, the unboxing video if you have it, and a short description on WhatsApp {{supportWhatsapp}} or at {{supportEmail}}. {{responseTime}}</p>
<h2>Refunds</h2>
<p>{{refundTiming}}</p>`,
};

const cancellation: StarterDraft = {
  slug: 'cancellation-policy',
  title: 'Cancellation policy',
  tokens: ['cancellationRule', 'supportWhatsapp', 'supportEmail', 'refundTiming'],
  bodyHtml: `
<p>This page explains when you can cancel an order. Nothing on this page limits any right you have under applicable consumer-protection law.</p>
<h2>Before we start making your order</h2>
<p>{{cancellationRule}}</p>
<h2>After we have started making it</h2>
<p>Once a personalised product has been printed, it cannot be cancelled, because it is made from your photograph or text. If something is wrong with it, see our Returns, replacement and refund policy.</p>
<h2>How to ask</h2>
<p>Contact us as soon as possible on WhatsApp {{supportWhatsapp}} or at {{supportEmail}} with your order number.</p>
<h2>Refunds for a cancelled order</h2>
<p>{{refundTiming}}</p>`,
};

const contact: StarterDraft = {
  slug: 'contact',
  title: 'Contact us',
  tokens: ['businessName', 'legalName', 'address', 'supportWhatsapp', 'supportEmail', 'supportHours', 'responseTime'],
  bodyHtml: `
<p>We are happy to help with your order.</p>
<h2>WhatsApp</h2>
<p>{{supportWhatsapp}}</p>
<h2>Email</h2>
<p>{{supportEmail}}</p>
<h2>When we are available</h2>
<p>{{supportHours}} {{responseTime}}</p>
<h2>Business details</h2>
<p>{{legalName}} (trading as {{businessName}}), {{address}}</p>`,
};

const grievance: StarterDraft = {
  slug: 'grievance',
  title: 'Grievance and customer support',
  tokens: ['grievanceName', 'grievanceDesignation', 'grievanceEmail', 'grievancePhone', 'responseTime', 'supportWhatsapp'],
  bodyHtml: `
<p>If you are not satisfied with how an order, a claim or your personal data was handled, you can raise a grievance.</p>
<h2>First, contact support</h2>
<p>Most problems are fastest to solve through support, on WhatsApp {{supportWhatsapp}}. Please include your order number.</p>
<h2>Grievance contact</h2>
<p>If your concern is not resolved, write to {{grievanceName}}, {{grievanceDesignation}}, at {{grievanceEmail}} or on {{grievancePhone}}.</p>
<p>{{responseTime}}</p>`,
};

const about: StarterDraft = {
  slug: 'about',
  title: 'About us',
  tokens: ['businessName', 'legalName', 'address', 'supportWhatsapp'],
  bodyHtml: `
<p>{{businessName}} makes photo frames and prints to order.</p>
<p>The business is run as {{legalName}}, {{address}}.</p>
<p>You can reach us on WhatsApp at {{supportWhatsapp}}.</p>
<p><!-- Add your own words here: who you are, why you started, and what you make. Only write what you can stand behind. --></p>`,
};

export const STARTER_DRAFTS: Record<StarterDraft['slug'], StarterDraft> = {
  privacy,
  terms,
  'shipping-policy': shipping,
  'return-refund-policy': returns,
  'cancellation-policy': cancellation,
  contact,
  grievance,
  about,
};
