/**
 * Search landing pages: one page per thing people type into Google ("birthday photo frame", "photo collage frame"…).
 * Each page has its own helpful text and FAQ, and lists the shop's products that match — so it is a real shopping
 * page, never a thin doorway. Products are matched by words in the product name and by occasion tags, so new
 * products appear on the right pages with no extra step.
 */
export interface LandingPage {
  slug: string;
  /** The search phrase the page is written for. */
  keyword: string;
  h1: string;
  title: string;
  description: string;
  /** Short answer under the heading. */
  lead: string;
  /** Body sections (plain text paragraphs). */
  sections: Array<{ heading: string; paragraphs: string[] }>;
  faq: Array<{ q: string; a: string }>;
  /** A product matches when its name contains any of these words, or it has any of these occasion tags. */
  match: { words?: string[]; tags?: string[]; all?: boolean };
  /** Other landing pages to link to at the bottom. */
  related: string[];
}

const DELIVERY =
  'Every frame is printed and framed to order in our workshop in Tamil Nadu and dispatched in 1–2 working days. We deliver to every state in India — free anywhere in Tamil Nadu, with a small delivery charge for other states that is shown at checkout before you pay.';
const HOW =
  'Pick a design, choose the size (8×12, 12×18 or 16×24 inches), then upload your photos straight from your phone. You see the finished frame on screen — move, zoom and swap photos until it looks right — and only then add it to your cart.';

/** Neighbouring states the shop delivers to, each with its own real delivery facts and cities. */
function statePage(o: { slug: string; state: string; cities: string; keyword: string; note: string }): LandingPage {
  return {
    slug: o.slug,
    keyword: o.keyword,
    h1: `Photo Frames Delivered in ${o.state}`,
    title: `Custom Photo Frames in ${o.state} | KarthysGallery`,
    description: `Order personalised photo frames and photo collages online with delivery anywhere in ${o.state}: ${o.cities.split(', ').slice(0, 4).join(', ')} and more.`,
    lead: `Design your frame online, preview it with your own photos, and we deliver it to your door anywhere in ${o.state}.`,
    sections: [
      {
        heading: `Delivery across ${o.state}`,
        paragraphs: [
          `We deliver to homes and offices across ${o.state}, including ${o.cities}. ${o.note}`,
          'Your frame is made to order and dispatched in 1–2 working days; delivery usually takes 2–4 working days after that. The delivery charge for your state is shown at checkout before you pay.',
        ],
      },
      { heading: 'Order from your phone', paragraphs: [HOW, 'Need help choosing? Message us on WhatsApp from any page.'] },
    ],
    faq: [
      { q: `Do you deliver to ${o.state}?`, a: `Yes. We deliver anywhere in ${o.state}; enter your PIN code at checkout to see the delivery charge.` },
      { q: 'How do I pay?', a: 'Online through Razorpay: UPI, card, net banking or wallet. Cash on delivery is not available, because every frame is made specially for you.' },
      { q: 'What if my frame arrives damaged?', a: 'Message us within 7 days of delivery with photos, and we will replace it when the problem is ours.' },
    ],
    match: { all: true },
    related: ['tamil-nadu', 'india', 'photo-collage-frames', 'personalised-photo-frames'],
  };
}

const STATE_PAGES: LandingPage[] = [
  statePage({
    slug: 'kerala',
    state: 'Kerala',
    keyword: 'photo frame online Kerala',
    cities: 'Kochi, Thiruvananthapuram, Kozhikode, Thrissur, Kollam, Kannur, Palakkad, Kottayam, Alappuzha and Malappuram',
    note: 'Our workshop is in Virudhunagar district in southern Tamil Nadu, next door to Kerala.',
  }),
  statePage({
    slug: 'karnataka',
    state: 'Karnataka',
    keyword: 'photo frame online Bangalore',
    cities: 'Bengaluru, Mysuru, Mangaluru, Hubballi, Belagavi, Davanagere, Shivamogga, Tumakuru, Udupi and Ballari',
    note: 'Every district is covered, from Bengaluru to the coast.',
  }),
  statePage({
    slug: 'puducherry',
    state: 'Puducherry',
    keyword: 'photo frame shop Puducherry',
    cities: 'Puducherry, Karaikal, Mahe and Yanam',
    note: 'All four regions of the union territory are covered.',
  }),
  {
    slug: 'india',
    keyword: 'customised photo frame online India',
    h1: 'Customised Photo Frames Delivered Across India',
    title: 'Customised Photo Frames Online India | KarthysGallery',
    description: 'Customised photo frames and photo collages made to order and delivered to every state in India. Upload photos, preview online, pay securely.',
    lead: 'Made to order in our Tamil Nadu workshop and delivered to every state and union territory in India.',
    sections: [
      {
        heading: 'We deliver everywhere in India',
        paragraphs: [
          'From Chennai to Delhi, Bengaluru to Mumbai, Kochi to Kolkata — we ship to every state and union territory. Delivery is free within Tamil Nadu; for other states a small delivery charge is shown at checkout before you pay.',
          'Your frame is made to order and dispatched in 1–2 working days; delivery usually takes 2–4 working days after that, a little longer for remote areas.',
        ],
      },
      { heading: 'How to order', paragraphs: [HOW] },
    ],
    faq: [
      { q: 'Do you deliver outside Tamil Nadu?', a: 'Yes, to every state and union territory in India. The delivery charge for your state is shown at checkout.' },
      { q: 'Is cash on delivery available?', a: 'No. Orders are paid online through Razorpay (UPI, card, net banking or wallet), because every frame is made specially for you.' },
      { q: 'Can I see the frame before I order?', a: 'Yes. You see a live preview with your own photos and text before you add it to your cart.' },
    ],
    match: { all: true },
    related: ['tamil-nadu', 'kerala', 'karnataka', 'puducherry'],
  },
];

export const LANDING_PAGES: LandingPage[] = [
  {
    slug: 'personalised-photo-frames',
    keyword: 'personalised photo frame online',
    h1: 'Personalised Photo Frames Online',
    title: 'Personalised Photo Frames Online | KarthysGallery',
    description: 'Order personalised photo frames online: upload your photos, add names and dates, preview the frame live and get it delivered anywhere in India.',
    lead: 'Turn your favourite photos into a framed print with your own names, dates and wishes — designed by you on screen and made to order and delivered anywhere in India.',
    sections: [
      { heading: 'Make it yours in a few minutes', paragraphs: [HOW, 'Many of our designs also have text you can change — a name, a wedding date, a birthday wish — and some have a calendar that marks your special day with a heart.'] },
      { heading: 'Printed to last, framed by hand', paragraphs: ['We print at full resolution for the size you choose and fit it in a 1-inch frame, ready to hang. Every photo is checked before printing; if one is too small to print sharply you are told before you order, instead of receiving a blurred print.', DELIVERY] },
      { heading: 'A gift that tells a story', paragraphs: ['Personalised frames are our most-gifted product for birthdays, weddings, anniversaries, a new baby and farewells. Choose a single-photo frame for one special moment or a collage to hold a whole year of memories.'] },
    ],
    faq: [
      { q: 'How do I order a personalised photo frame?', a: 'Choose a design, pick a size, upload your photos and type any names or dates. You see a live preview of the finished frame before you add it to your cart and pay.' },
      { q: 'How long does delivery take?', a: 'We dispatch in 1–2 working days, and delivery usually takes 2–4 working days after that, anywhere in India. Delivery within Tamil Nadu is free.' },
      { q: 'What if my photo is low quality?', a: 'The website checks each photo for the size you choose. If a photo is too small to print sharply you are warned before ordering, and our team checks again before printing.' },
      { q: 'Which sizes are available?', a: 'Most frames come in 8×12, 12×18 and 16×24 inches (landscape designs in 12×8, 18×12 and 24×16).' },
    ],
    match: { all: true },
    related: ['photo-collage-frames', 'birthday-photo-frames', 'wedding-anniversary-photo-frames', 'baby-photo-frames'],
  },
  {
    slug: 'photo-collage-frames',
    keyword: 'photo collage frame',
    h1: 'Photo Collage Frames',
    title: 'Photo Collage Frames, 5 to 70 Photos | KarthysGallery',
    description: 'Photo collage frames for 5 to 70 photos: hearts, grids, Christmas tree and more. Upload photos, preview online and order. Delivered across India.',
    lead: 'Put a whole story on one wall — from 5 favourite pictures to 70 photos of a school batch, arranged in hearts, grids, polaroids, hexagons and more.',
    sections: [
      { heading: 'Choose a collage that fits your memories', paragraphs: ['Grids suit friends and family albums, heart shapes suit couples and anniversaries, month-by-month designs suit a baby’s first year, and our hexagon collage holds up to 70 faces for a class or office farewell.', 'Each collage shows how many photos it needs. You can upload them all at once — they fill the spaces in order — and then tap any space to swap, move or zoom a photo.'] },
      { heading: 'See the finished collage before you pay', paragraphs: [HOW, 'You can also view your collage on a wall, a bedroom or a table in the preview, at its real size.'] },
      { heading: 'Made to order', paragraphs: [DELIVERY] },
    ],
    faq: [
      { q: 'How many photos can a collage frame hold?', a: 'Our collages hold from 5 to 70 photos — each design says exactly how many.' },
      { q: 'Can I add names and dates to a collage?', a: 'Yes, many collage designs include text for names, dates or a short wish, and some include a calendar marking your special day.' },
      { q: 'Do I need all the photos ready at once?', a: 'You can upload them in one go or a few at a time. Your design is kept on your device while you work on it.' },
    ],
    match: { words: ['collage'] },
    related: ['personalised-photo-frames', 'family-photo-frames', 'birthday-photo-frames', 'calendar-photo-frames'],
  },
  {
    slug: 'birthday-photo-frames',
    keyword: 'birthday photo frame',
    h1: 'Birthday Photo Frames',
    title: 'Birthday Photo Frames with Name & Date | KarthysGallery',
    description: 'Personalised birthday photo frames with name, date and calendar. Choose a collage, upload photos and preview online. Delivered across India.',
    lead: 'A birthday gift they will keep on the wall: their photos, their name and the date, framed and delivered to their door.',
    sections: [
      { heading: 'Birthday frames with their name and day', paragraphs: ['Our birthday designs let you type the name and a wish, and the calendar designs mark the birthday with a heart. Baby first-birthday designs have a space for every month of the first year.'] },
      { heading: 'Easy to order, ready in days', paragraphs: [HOW, DELIVERY] },
    ],
    faq: [
      { q: 'Can I order a birthday frame for a first birthday?', a: 'Yes — our first-birthday and “my first year” designs have a photo space for each month and space for the baby’s name.' },
      { q: 'Will it arrive in time for the birthday?', a: 'We dispatch in 1–2 working days and delivery usually takes 2–4 more; order a week ahead to be safe.' },
    ],
    match: { words: ['birthday'], tags: ['birthday'] },
    related: ['baby-photo-frames', 'photo-collage-frames', 'calendar-photo-frames', 'personalised-photo-frames'],
  },
  {
    slug: 'wedding-anniversary-photo-frames',
    keyword: 'wedding photo frame',
    h1: 'Wedding & Anniversary Photo Frames',
    title: 'Wedding & Anniversary Photo Frames | KarthysGallery',
    description: 'Wedding and anniversary photo frames: couple collages, love-story timelines and calendars with your date. Preview online, delivered across India.',
    lead: 'Celebrate the day you said yes — couple collages, love-story timelines and calendar frames that mark your wedding date.',
    sections: [
      { heading: 'Frames for every chapter of your story', paragraphs: ['Choose a “love story” timeline for the first meeting, engagement and wedding, a heart collage of your favourite moments together, or a calendar frame that marks the wedding day with a heart.', 'Names, dates and short wishes are typed by you — we never print the sample names you see in the shop pictures.'] },
      { heading: 'A meaningful anniversary gift', paragraphs: [HOW, DELIVERY] },
    ],
    faq: [
      { q: 'Can I put our names and wedding date on the frame?', a: 'Yes — type them in when you design the frame; the preview shows exactly how they will be printed.' },
      { q: 'Is it a good anniversary gift?', a: 'It is our most popular anniversary gift: a collage of your years together, with the date you married.' },
    ],
    match: { words: ['wedding', 'anniversary', 'couple', 'love', 'heart'], tags: ['wedding', 'anniversary', 'valentine'] },
    related: ['couple-photo-frames', 'calendar-photo-frames', 'photo-collage-frames', 'personalised-photo-frames'],
  },
  {
    slug: 'couple-photo-frames',
    keyword: 'couple photo frame',
    h1: 'Couple Photo Frames',
    title: 'Personalised Couple Photo Frames | KarthysGallery',
    description: 'Couple photo frames: LOVE letters, heart collages, song plaques and love-story timelines. Add names, preview online. Delivered across India.',
    lead: 'Gifts for your partner that are truly about the two of you — your photos, your names and the moments that matter.',
    sections: [
      { heading: 'Romantic designs to choose from', paragraphs: ['LOVE-letter frames, heart collages, a music-plaque style frame with your names, and timeline frames from first meeting to wedding day.'] },
      { heading: 'How it works', paragraphs: [HOW, DELIVERY] },
    ],
    faq: [{ q: 'Which couple frame makes the best surprise gift?', a: 'A heart collage of your favourite photos together is our most-chosen surprise; a love-story timeline is ideal for anniversaries.' }],
    match: { words: ['couple', 'love', 'heart', 'spotify', 'wedding'], tags: ['valentine', 'anniversary'] },
    related: ['wedding-anniversary-photo-frames', 'photo-collage-frames', 'personalised-photo-frames'],
  },
  {
    slug: 'baby-photo-frames',
    keyword: 'baby photo frame',
    h1: 'Baby Photo Frames',
    title: 'Baby Photo Frames & Milestone Collages | KarthysGallery',
    description: 'Baby photo frames with birth details, 12-month milestone collages and first-birthday designs. Add the name, preview online, delivered across India.',
    lead: 'Keep the first year forever — birth-details frames, month-by-month collages and first-birthday designs with your baby’s name.',
    sections: [
      { heading: 'From birth to first birthday', paragraphs: ['Birth-details frames show the baby’s name, date, time, weight and hospital beside their first photos. Month-by-month designs give each of the twelve months its own photo, and first-birthday frames celebrate the whole year.'] },
      { heading: 'Simple to make on your phone', paragraphs: [HOW, DELIVERY] },
    ],
    faq: [
      { q: 'What details can a baby birth frame include?', a: 'Name, date, time of birth, weight, blood group, hospital and parents’ names — all typed by you.' },
      { q: 'Do you have frames for each month of the first year?', a: 'Yes — our 12-month designs have a labelled photo space for every month.' },
    ],
    match: { words: ['baby', 'month', 'first year', 'first birthday'], tags: ['baby', 'newborn'] },
    related: ['birthday-photo-frames', 'family-photo-frames', 'photo-collage-frames'],
  },
  {
    slug: 'family-photo-frames',
    keyword: 'family photo frame',
    h1: 'Family Photo Frames',
    title: 'Family Photo Frames & Collages | KarthysGallery',
    description: 'Family photo frames and collages for your home: grids, hearts and “Family is Forever” designs. Upload photos, preview online, delivered across India.',
    lead: 'Bring the whole family together on one wall — from grandparents to the newest arrival.',
    sections: [
      { heading: 'Designs for a family wall', paragraphs: ['Large grid collages hold dozens of photos from weddings, festivals and trips; heart and “Family is Forever” designs make a warm centrepiece for the living room.'] },
      { heading: 'How it works', paragraphs: [HOW, DELIVERY] },
    ],
    faq: [{ q: 'Which size is best for a living-room wall?', a: '16×24 inches suits a main wall; 12×18 inches suits a shelf, bedroom or a group of frames.' }],
    match: { words: ['family', 'grid', 'border', 'classic', 'modern', 'mosaic', 'panorama'], tags: ['family'] },
    related: ['photo-collage-frames', 'personalised-photo-frames', 'baby-photo-frames'],
  },
  {
    slug: 'calendar-photo-frames',
    keyword: 'calendar photo frame',
    h1: 'Calendar Photo Frames',
    title: 'Calendar Photo Frames for Special Dates | KarthysGallery',
    description: 'Calendar photo frames that mark a birthday, wedding or anniversary date with a heart. Add photos and names, preview online. Delivered across India.',
    lead: 'A photo frame with a calendar of the month that matters — the date you choose is marked with a heart.',
    sections: [
      { heading: 'Your date, marked forever', paragraphs: ['Pick any date when you design the frame: the calendar redraws for that month and year and marks the day with a heart. Perfect for birthdays, weddings and the day you met.'] },
      { heading: 'How it works', paragraphs: [HOW, DELIVERY] },
    ],
    faq: [{ q: 'Can I choose any date?', a: 'Yes — pick the date in the designer; the calendar changes to that month and marks the day.' }],
    match: { words: ['calendar'] },
    related: ['birthday-photo-frames', 'wedding-anniversary-photo-frames', 'photo-collage-frames'],
  },
  {
    slug: 'tamil-nadu',
    keyword: 'photo frame shop Tamil Nadu',
    h1: 'Photo Frames Delivered Across Tamil Nadu',
    title: 'Custom Photo Frames in Tamil Nadu | KarthysGallery',
    description: 'Order custom photo frames online with free delivery anywhere in Tamil Nadu — Chennai, Coimbatore, Madurai, Trichy, Salem, Tirunelveli and every district.',
    lead: 'Made in Tamil Nadu, delivered free to every district — design your frame online and get it at your door.',
    sections: [
      { heading: 'Free delivery to every district', paragraphs: ['We deliver free to homes and offices across Tamil Nadu, including Chennai, Coimbatore, Madurai, Tiruchirappalli, Salem, Tirunelveli, Erode, Vellore, Thoothukudi, Thanjavur, Dindigul, Virudhunagar and Kanyakumari.', 'Enter your PIN code at checkout to see the delivery estimate for your area.'] },
      { heading: 'Order from your phone', paragraphs: [HOW, 'Need help choosing? Message us on WhatsApp from any page.'] },
    ],
    faq: [
      { q: 'Is delivery free in Tamil Nadu?', a: 'Yes, delivery is free to any address in Tamil Nadu.' },
      { q: 'Do you deliver outside Tamil Nadu?', a: 'Yes, we ship across India; the delivery charge for your state is shown at checkout.' },
    ],
    match: { all: true },
    related: ['kerala', 'karnataka', 'puducherry', 'india'],
  },
  ...STATE_PAGES,
];

export function landingPageBySlug(slug: string): LandingPage | undefined {
  return LANDING_PAGES.find((p) => p.slug === slug);
}

/** Whether a product belongs on a landing page (by words in its name or its occasion tags). */
export function productMatchesLanding(page: LandingPage, product: { title: string; occasionTags?: string[] }): boolean {
  if (page.match.all) return true;
  const name = product.title.toLowerCase();
  if (page.match.words?.some((w) => name.includes(w.toLowerCase()))) return true;
  const tags = (product.occasionTags ?? []).map((t) => t.toLowerCase());
  return Boolean(page.match.tags?.some((t) => tags.includes(t)));
}
