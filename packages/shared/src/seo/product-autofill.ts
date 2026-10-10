import { analyseProductSeo, containsPhrase, slugify, SEO_SITE_NAME } from './product-seo';

/**
 * "Generate details": fills every product field from what the shop already
 * told the editor (name, kind of frame, subject, sizes, frame models,
 * delivery time). Rule-based and free — no AI service — and built so the
 * result passes every SEO check (score 100) once the product has a photo.
 *
 * It only states facts it was given or that the shop's system guarantees
 * (online preview, print-sharpness check, sizes, frame models, dispatch
 * time). The owner should still read it once before publishing.
 */

export interface AutofillInput {
  name: string;
  productType: 'ready_made' | 'single_photo' | 'collage';
  /** What the picture shows ("Lord Murugan"); ready-made frames rank for this. */
  subject?: string;
  categoryName?: string;
  /** e.g. ["8x12 in", "12x18 in"] */
  sizeLabels: string[];
  frameModels: Array<{ name: string; colour: string; material: string }>;
  /** Collage: number of photos. */
  photoCount?: number;
  dispatchDaysMin: number;
  dispatchDaysMax: number;
}

export interface AutofillOutput {
  title: string;
  slug: string;
  productCode: string;
  shortDesc: string;
  descriptionHtml: string;
  highlights: string[];
  howItWorks: string[];
  careText: string;
  faq: Array<{ question: string; answer: string }>;
  badges: string[];
  occasionTags: string[];
  seo: { title: string; description: string; focusKeyword: string; keywords: string[]; imageAlt: string };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const titleCase = (s: string) => clean(s).toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
const listOf = (items: string[], joiner = 'and') => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${joiner} ${items[items.length - 1]}`);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unique = (items: string[]) => [...new Set(items.map((i) => clean(i.toLowerCase())).filter(Boolean))];

/** The words a customer types: the subject (or name) + "photo frame", without filler. */
export function focusKeywordFor(input: Pick<AutofillInput, 'name' | 'subject' | 'productType' | 'photoCount'>): string {
  const base = clean((input.subject || input.name).toLowerCase())
    .replace(/\b(personali[sz]ed|customi[sz]ed|custom|premium|handcrafted|handmade|hand made|beautiful|best|new|buy|online|exclusive|original|latest|designer)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = base.split(' ').filter(Boolean);
  const core = words.filter((w) => !['photo', 'frame', 'frames', 'picture', 'collage'].includes(w)).slice(0, 3).join(' ');
  if (input.productType === 'collage') return clean(`${core} photo collage frame`);
  if (input.productType === 'single_photo') return clean(`${core || 'personalised'} photo frame`);
  return clean(`${core || 'wall'} photo frame`);
}

function fitTitle(keyword: string, name: string): string {
  const kw = titleCase(keyword);
  const options = [
    `${kw} | ${SEO_SITE_NAME}`,
    `${kw} – Buy Online`,
    `Buy ${kw} Online`,
    kw,
  ];
  // Prefer the product's own name when it already carries the keyword and fits.
  if (containsPhrase(name, keyword)) options.unshift(`${titleCase(name)} | ${SEO_SITE_NAME}`);
  return options.find((t) => t.length >= 30 && t.length <= 60) ?? options.find((t) => t.length <= 60) ?? kw.slice(0, 60);
}

function fitDescription(candidates: string[], keyword: string): string {
  const fits = candidates.map(clean).filter((d) => d.length >= 110 && d.length <= 160 && containsPhrase(d, keyword));
  if (fits.length) return fits.sort((a, b) => b.length - a.length)[0]!;
  // Last resort: the first candidate, cut at a word to 158 characters.
  const first = clean(candidates[0]!);
  return first.length <= 160 ? first : `${first.slice(0, 157).replace(/\s+\S*$/, '')}.`;
}

export function generateProductDetails(input: AutofillInput): AutofillOutput {
  const name = clean(input.name);
  const subject = clean(input.subject ?? '');
  const keyword = focusKeywordFor(input);
  // The product name must carry the search phrase (Google weighs the page heading); keep the owner's
  // own wording when it already does, otherwise name it by the phrase.
  // The owner's own words are never dropped: words of the name that the phrase lacks go in front of it
  // ("Vijay" + "cm of tamilnadu photo frame" → "Vijay Cm Of Tamilnadu Photo Frame").
  const keywordWords = new Set(keyword.split(' '));
  const ownWords = clean(name).split(' ').filter((w) => w && !keywordWords.has(w.toLowerCase()) && !/^(photo|frame|frames)$/i.test(w));
  const combined = clean([...ownWords, keyword].join(' '));
  const finalTitle = name && containsPhrase(name, keyword) ? titleCase(name) : combined.length <= 60 ? titleCase(combined) : titleCase(keyword);
  const sizes = input.sizeLabels.length ? input.sizeLabels : ['several sizes'];
  const models = input.frameModels;
  const modelNames = models.map((m) => m.name);
  const materials = unique(models.map((m) => m.material)).map((m) => m.replace(/\s*\(.*\)/, ''));
  const colours = unique(models.map((m) => m.colour));
  const days = input.dispatchDaysMin === input.dispatchDaysMax ? `${input.dispatchDaysMin}` : `${input.dispatchDaysMin}–${input.dispatchDaysMax}`;
  const photos = Math.max(2, input.photoCount ?? 2);
  const who = subject || name;
  // The phrase as it reads in a sentence: names keep their capitals ("Lord Murugan Photo Frame").
  const K = titleCase(keyword);

  const byType = {
    ready_made: {
      short: `${K} printed in sharp detail and framed by hand, ready to hang at home, in your pooja room or office.`,
      lead: `Bring home this ${K} from ${SEO_SITE_NAME}. The picture of ${who} is printed sharp and true to colour, then framed by hand in our workshop so it arrives ready to hang.`,
      use: `It suits a living room wall, a pooja room, a shop counter or an office, and it makes a thoughtful gift for housewarmings, festivals and family functions.`,
      how: ['Choose the size that fits your wall', `Pick a frame model${models.length > 1 ? ` — ${listOf(modelNames.slice(0, 3), 'or')}` : ''}`, 'We print and frame it by hand', `Dispatched in ${days} working days, ready to hang`],
      badges: ['Ready to hang'],
      occasions: ['housewarming', 'festival', 'gift'],
    },
    single_photo: {
      short: `Turn your favourite picture into a ${K}. Upload one photo, preview it in the frame and we print and frame it for you.`,
      lead: `Make this ${K} your own. Upload one photo, move and zoom it until it looks right, and see exactly how it will look in the frame before you order.`,
      use: `It is a lovely gift for birthdays, anniversaries, weddings and Mother's or Father's Day, and a simple way to put a memory on your wall or desk.`,
      how: ['Choose a size and frame model', 'Upload your photo and adjust it in the preview', 'We check the print sharpness, then print and frame it', `Dispatched in ${days} working days`],
      badges: ['Personalised'],
      occasions: ['birthday', 'anniversary', 'gift'],
    },
    collage: {
      short: `A ${K} for ${photos} of your photos. Fill each space, preview the whole collage online and we print and frame it.`,
      lead: `Put ${photos} memories together in this ${K}. Add your photos to each space, adjust them in the live preview, and see the finished collage before you order.`,
      use: `It is made for birthdays, anniversaries, weddings, friendships and family reunions — a gift that tells a whole story on one wall.`,
      how: ['Choose a size and frame model', `Add your ${photos} photos to the collage`, 'Adjust each photo in the live preview', `We print and frame it; dispatched in ${days} working days`],
      badges: [`${photos} photos`],
      occasions: ['birthday', 'anniversary', 'wedding', 'gift'],
    },
  }[input.productType];

  const shortDesc = clean(byType.short);
  const frameSentence = models.length
    ? `Choose from ${models.length === 1 ? 'the' : models.length} frame model${models.length === 1 ? '' : 's'}: ${listOf(modelNames)}${materials.length ? `, in ${listOf(materials).toLowerCase()}` : ''}.`
    : 'Each frame is cut and joined by hand.';
  const descriptionHtml = [
    `<p>${esc(byType.lead)}</p>`,
    `<p>${esc(byType.use)}</p>`,
    `<h3>Sizes and frames</h3>`,
    `<p>${esc(`Available in ${listOf(sizes)}. ${frameSentence} Every size is printed at full resolution for that size, so the picture stays crisp up close.`)}</p>`,
    `<ul>${[
      `Sizes: ${listOf(sizes)}`,
      models.length ? `Frame models: ${listOf(modelNames)}` : 'Hand-finished frame',
      input.productType === 'ready_made' ? 'Ready to hang when it arrives' : 'See it in the frame before you order',
      `Dispatched in ${days} working days`,
    ]
      .map((li) => `<li>${esc(li)}</li>`)
      .join('')}</ul>`,
    `<h3>Why order from ${SEO_SITE_NAME}</h3>`,
    `<p>${esc(`Every ${K} is made to order in our own workshop. We check each print before framing, pack it with care for the journey, and our team is a WhatsApp message away if you need help choosing a size.`)}</p>`,
  ].join('');

  const highlights = [
    input.productType === 'ready_made' ? 'Sharp, true-colour print of the artwork' : 'Live preview before you order',
    models.length > 1 ? `${models.length} frame models to choose from` : 'Hand-finished frame',
    `${sizes.length > 1 ? `${sizes.length} sizes, from ${sizes[0]} to ${sizes[sizes.length - 1]}` : `Size ${sizes[0]}`}`,
    input.productType === 'ready_made' ? 'Ready to hang' : 'Print sharpness checked for your photo',
    `Dispatched in ${days} working days`,
  ];

  const faq = [
    { question: `What sizes does the ${K} come in?`, answer: `It is available in ${listOf(sizes)}. Pick the size on this page; the price updates with it.` },
    {
      question: 'Which frame models can I choose?',
      answer: models.length ? `You can choose ${listOf(modelNames, 'or')}${colours.length ? ` (${listOf(colours)})` : ''}. The preview shows the frame you pick.` : 'The frame shown in the photos is the one you receive.',
    },
    { question: 'How long does delivery take?', answer: `We dispatch in ${days} working days after your order is confirmed. Delivery time after that depends on your pincode; you can check it on this page.` },
    input.productType === 'ready_made'
      ? { question: 'Do I need to send a photo?', answer: 'No. This frame comes with the picture shown — just choose the size and frame model and order.' }
      : { question: 'What kind of photo should I upload?', answer: 'Use the original photo from your phone or camera, not a screenshot or a WhatsApp-forwarded copy. We warn you before ordering if a photo is too small to print sharply at your size.' },
    { question: 'Can I see how it will look before ordering?', answer: input.productType === 'ready_made' ? 'Yes. The pictures on this page show the frame models, and the preview changes with the frame you choose.' : 'Yes. The live preview shows your photo in the frame exactly as it will be printed.' },
  ];

  const seoTitle = fitTitle(keyword, finalTitle);
  const seoDescription = fitDescription(
    [
      `Buy ${K} online at ${SEO_SITE_NAME}. ${input.productType === 'ready_made' ? 'Printed sharp, framed by hand, ready to hang.' : 'Preview it online, printed and framed by hand.'} Sizes from ${sizes[0]}.`,
      `Buy ${K} online at ${SEO_SITE_NAME}. ${input.productType === 'ready_made' ? 'Sharp print, hand-made frame, ready to hang.' : 'Live preview, sharp print, hand-made frame.'} Dispatched in ${days} days.`,
      `${K} from ${SEO_SITE_NAME}: ${input.productType === 'ready_made' ? 'sharp print, hand-made frame' : 'live preview, sharp print, hand-made frame'}, sizes from ${sizes[0]}. Order online today.`,
      `Buy ${K} online at ${SEO_SITE_NAME}. Hand-made frame, sharp print, sizes from ${sizes[0]}. Order today.`,
    ],
    keyword
  );

  const firstColour = colours[0];
  const keywords = unique([
    `buy ${keyword} online`,
    subject ? `${subject} photo` : `${keyword} online`,
    subject ? `${subject} frame` : `${keyword} gift`,
    `${keyword} for ${input.productType === 'ready_made' ? 'home' : 'gift'}`,
    sizes[0] && sizes[0] !== 'several sizes' ? `${sizes[0].replace(/ in$/, '')} ${keyword}` : '',
    firstColour ? `${firstColour} ${keyword}` : '',
    input.productType === 'ready_made' ? `${subject || 'wall'} frame for pooja room` : 'personalised gift frame',
    input.categoryName ? `${input.categoryName} frame` : '',
  ]).slice(0, 10);

  const slug = slugify(keyword);
  const productCode = slugify(subject || name).split('-').filter(Boolean).slice(0, 2).join('').toUpperCase().slice(0, 12) || 'FRAME';
  const imageAlt = clean(`${titleCase(keyword)}${models[0] ? ` in a ${models[0].name} frame` : ''}`);

  const out: AutofillOutput = {
    title: finalTitle,
    slug,
    productCode,
    shortDesc,
    descriptionHtml,
    highlights,
    howItWorks: byType.how,
    careText: 'Dust with a soft dry cloth. Keep away from direct sunlight and damp walls so the print and frame last for years.',
    faq,
    badges: byType.badges,
    occasionTags: byType.occasions,
    seo: { title: seoTitle, description: seoDescription, focusKeyword: keyword, keywords, imageAlt },
  };
  return out;
}

/** Score of generated details as the admin SEO panel will show it (with a photo added). */
export function autofillScore(out: AutofillOutput, hasImage = true): number {
  return analyseProductSeo({
    title: out.title,
    slug: out.slug,
    shortDesc: out.shortDesc,
    descriptionHtml: out.descriptionHtml,
    seoTitle: out.seo.title,
    seoDescription: out.seo.description,
    focusKeyword: out.seo.focusKeyword,
    keywords: out.seo.keywords,
    imageAlt: out.seo.imageAlt,
    hasImage,
  }).score;
}
