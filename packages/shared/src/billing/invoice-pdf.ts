import { PDFDocument, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { NOTO_SANS_REGULAR, NOTO_SANS_SEMIBOLD } from './fonts/noto-sans';
import type { Invoice } from '../schemas/billing';

/**
 * The ONE invoice document: online orders, in-store bills and credit notes
 * all render through this. A4, printable, and readable on a phone (it is a
 * PDF, so it zooms cleanly). Server-only — import it by path, it is not in
 * the shared barrel (the browser never needs pdf-lib).
 */

const A4 = { w: 595.28, h: 841.89 };
const M = 42; // page margin
const INK = rgb(0.08, 0.13, 0.24); // #14213D
const MUTED = rgb(0.4, 0.42, 0.47);
const LINE = rgb(0.88, 0.86, 0.82);
const GOLD = rgb(0.79, 0.53, 0.1); // #C9861A
const WOOD = rgb(0.55, 0.36, 0.2);
const TINT = rgb(0.98, 0.96, 0.93);

const STATUS_LABEL: Record<Invoice['status'], string> = {
  paid: 'PAID',
  pending: 'PENDING',
  refunded: 'REFUNDED',
  partially_refunded: 'PARTIALLY REFUNDED',
  cancelled: 'CANCELLED',
};

const METHOD_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', other: 'Other', online: 'Paid online' };

function rupees(paise: number): string {
  const neg = paise < 0;
  const v = (Math.abs(paise) / 100).toFixed(2);
  const [int, dec] = v.split('.');
  // Indian grouping: 12,34,567.89
  const last3 = int!.slice(-3);
  const rest = int!.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}₹${rest ? `${rest},` : ''}${last3}.${dec}`;
}

function dateIN(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export async function renderInvoicePdf(invoice: Invoice): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(Buffer.from(NOTO_SANS_REGULAR, 'base64'), { subset: false });
  const bold = await pdf.embedFont(Buffer.from(NOTO_SANS_SEMIBOLD, 'base64'), { subset: false });
  const supported = new Set(regular.getCharacterSet());
  // Characters the font can't draw (e.g. a name typed in another script) are left out rather than breaking the PDF.
  const clean = (text: string) =>
    [...String(text ?? '')]
      .filter((c) => supported.has(c.codePointAt(0)!))
      .join('')
      .replace(/ {2,}/g, ' ');

  const isCredit = invoice.kind === 'credit_note';
  const title = isCredit ? 'CREDIT NOTE' : invoice.seller.gstin ? 'TAX INVOICE' : 'INVOICE';
  pdf.setTitle(`${title} ${invoice.invoiceNo}`);
  pdf.setAuthor(invoice.seller.name);
  pdf.setCreator('Karthys Gallery billing');

  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;

  const text = (p: PDFPage, s: string, x: number, yy: number, size: number, font: PDFFont = regular, color = INK) => p.drawText(clean(s), { x, y: yy, size, font, color });
  const right = (p: PDFPage, s: string, xRight: number, yy: number, size: number, font: PDFFont = regular, color = INK) => {
    const c = clean(s);
    p.drawText(c, { x: xRight - font.widthOfTextAtSize(c, size), y: yy, size, font, color });
  };
  const wrap = (s: string, font: PDFFont, size: number, width: number): string[] => {
    const words = clean(s).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= width) cur = next;
      else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };

  // --- Brand mark: two tilted frames, as in the Karthys Gallery logo ---------
  const drawMark = (p: PDFPage, x: number, yy: number) => {
    p.drawRectangle({ x: x + 4, y: yy - 30, width: 26, height: 32, borderColor: WOOD, borderWidth: 3, rotate: degrees(8), color: rgb(1, 1, 1) });
    p.drawRectangle({ x: x + 18, y: yy - 36, width: 20, height: 24, borderColor: GOLD, borderWidth: 3, rotate: degrees(-10), color: rgb(1, 1, 1) });
  };

  const header = (p: PDFPage, first: boolean) => {
    drawMark(p, M, A4.h - M + 4);
    text(p, invoice.seller.name.toUpperCase(), M + 52, A4.h - M - 12, 15, bold);
    if (invoice.seller.legalName) text(p, invoice.seller.legalName, M + 52, A4.h - M - 26, 8, regular, MUTED);
    right(p, title, A4.w - M, A4.h - M - 10, 15, bold, isCredit ? WOOD : INK);
    right(p, invoice.invoiceNo, A4.w - M, A4.h - M - 26, 9.5, bold);
    p.drawRectangle({ x: M, y: A4.h - M - 44, width: A4.w - 2 * M, height: 1.6, color: GOLD });
    if (!first) right(p, `${title} ${invoice.invoiceNo} (continued)`, A4.w - M, A4.h - M - 58, 8, regular, MUTED);
  };
  header(page, true);
  y = A4.h - M - 64;

  // --- Seller and document details ---------------------------------------
  const colW = (A4.w - 2 * M) / 2;
  const sellerLines = [
    ...(invoice.seller.address ? wrap(invoice.seller.address, regular, 8.5, colW - 20) : []),
    [invoice.seller.phone, invoice.seller.email].filter(Boolean).join('  ·  '),
    invoice.seller.gstin ? `GSTIN: ${invoice.seller.gstin}` : '',
  ].filter(Boolean);
  let sy = y;
  text(page, 'FROM', M, sy, 7, bold, MUTED);
  sy -= 12;
  text(page, invoice.seller.name, M, sy, 9.5, bold);
  for (const l of sellerLines) {
    sy -= 11.5;
    text(page, l, M, sy, 8.5);
  }
  const details: Array<[string, string]> = [
    [isCredit ? 'Credit note date' : 'Invoice date', dateIN(invoice.issuedAt)],
    ...(invoice.orderNo ? ([['Order', invoice.orderNo]] as Array<[string, string]>) : []),
    ...(invoice.originalInvoiceNo ? ([['Against invoice', invoice.originalInvoiceNo]] as Array<[string, string]>) : []),
    ['Sold', invoice.channel === 'online' ? 'Online' : 'In store'],
  ];
  let dy = y;
  for (const [k, v] of details) {
    right(page, k, A4.w - M - 110, dy, 8.5, regular, MUTED);
    right(page, v, A4.w - M, dy, 8.5, bold);
    dy -= 12.5;
  }
  // Status badge
  const status = STATUS_LABEL[invoice.status];
  const badgeW = bold.widthOfTextAtSize(status, 8) + 16;
  const badgeColor = invoice.status === 'paid' ? rgb(0.13, 0.5, 0.3) : invoice.status === 'pending' ? GOLD : WOOD;
  page.drawRectangle({ x: A4.w - M - badgeW, y: dy - 6, width: badgeW, height: 15, color: badgeColor, borderColor: badgeColor, borderWidth: 0.5 });
  text(page, status, A4.w - M - badgeW + 8, dy - 1.5, 8, bold, rgb(1, 1, 1));
  y = Math.min(sy, dy - 10) - 22;

  // --- Bill to / Ship to ----------------------------------------------------
  const party = (label: string, x: number, lines: string[]) => {
    let py = y;
    text(page, label, x, py, 7, bold, MUTED);
    py -= 12;
    for (const [i, l] of lines.entries()) {
      for (const w of wrap(l, i === 0 ? bold : regular, i === 0 ? 9.5 : 8.5, colW - 20)) {
        text(page, w, x, py, i === 0 ? 9.5 : 8.5, i === 0 ? bold : regular);
        py -= i === 0 ? 12.5 : 11.5;
      }
    }
    return py;
  };
  const billLines = [invoice.customer.name, ...(invoice.customer.address ?? []), [invoice.customer.phone, invoice.customer.email].filter(Boolean).join('  ·  ')].filter(Boolean);
  const by1 = party('BILL TO', M, billLines);
  const by2 = invoice.shippingAddress ? party('SHIP TO', M + colW, [invoice.customer.name, ...invoice.shippingAddress]) : y;
  y = Math.min(by1, by2) - 14;

  // --- Items table ----------------------------------------------------------
  const cols = { n: M + 6, item: M + 26, qty: A4.w - M - 210, unit: A4.w - M - 140, disc: A4.w - M - 70, amt: A4.w - M - 6 };
  const tableHeader = (p: PDFPage, yy: number) => {
    p.drawRectangle({ x: M, y: yy - 6, width: A4.w - 2 * M, height: 20, color: INK });
    const h = (s: string, x: number, alignRight = false) => (alignRight ? right(p, s, x, yy, 7.5, bold, rgb(1, 1, 1)) : text(p, s, x, yy, 7.5, bold, rgb(1, 1, 1)));
    h('#', cols.n);
    h('ITEM', cols.item);
    h('QTY', cols.qty, true);
    h('UNIT PRICE', cols.unit, true);
    h('DISCOUNT', cols.disc, true);
    h('AMOUNT', cols.amt, true);
    return yy - 22;
  };
  y = tableHeader(page, y);
  const itemWidth = cols.qty - cols.item - 30;
  invoice.lines.forEach((line, i) => {
    const titleLines = wrap(line.title, bold, 8.5, itemWidth);
    const sub = [line.variantLabel, line.sku ? `SKU ${line.sku}` : null].filter(Boolean).join('  ·  ');
    const subLines = sub ? wrap(sub, regular, 7.5, itemWidth) : [];
    const rowH = titleLines.length * 11 + subLines.length * 10 + 8;
    if (y - rowH < M + 150) {
      page = pdf.addPage([A4.w, A4.h]);
      header(page, false);
      y = tableHeader(page, A4.h - M - 76);
    }
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - rowH + 10, width: A4.w - 2 * M, height: rowH, color: TINT });
    text(page, String(i + 1), cols.n, y, 8.5, regular, MUTED);
    let ly = y;
    for (const t of titleLines) {
      text(page, t, cols.item, ly, 8.5, bold);
      ly -= 11;
    }
    for (const t of subLines) {
      text(page, t, cols.item, ly, 7.5, regular, MUTED);
      ly -= 10;
    }
    right(page, String(line.qty), cols.qty, y, 8.5);
    right(page, rupees(line.unitPrice), cols.unit, y, 8.5);
    right(page, line.discount ? `-${rupees(line.discount)}` : '—', cols.disc, y, 8.5, regular, line.discount ? WOOD : MUTED);
    right(page, rupees(line.lineTotal), cols.amt, y, 8.5, bold);
    y -= rowH;
  });
  page.drawRectangle({ x: M, y: y + 4, width: A4.w - 2 * M, height: 0.8, color: LINE });

  // --- Totals ---------------------------------------------------------------
  if (y < M + 170) {
    page = pdf.addPage([A4.w, A4.h]);
    header(page, false);
    y = A4.h - M - 80;
  }
  y -= 12;
  const lineDiscounts = invoice.lines.reduce((s, l) => s + l.discount, 0);
  const orderDiscount = invoice.discount - lineDiscounts;
  const rows: Array<[string, string, boolean]> = [
    ['Subtotal', rupees(invoice.subtotal), false],
    ...(lineDiscounts ? ([['Item discounts', `-${rupees(lineDiscounts)}`, false]] as Array<[string, string, boolean]>) : []),
    ...(orderDiscount ? ([[invoice.couponCode ? `Coupon ${invoice.couponCode}` : 'Discount', `-${rupees(orderDiscount)}`, false]] as Array<[string, string, boolean]>) : []),
    ...(invoice.channel === 'online' ? ([['Shipping', invoice.shipping ? rupees(invoice.shipping) : 'Free', false]] as Array<[string, string, boolean]>) : []),
  ];
  const tx = A4.w - M - 200;
  for (const [k, v] of rows) {
    text(page, k, tx, y, 9, regular, MUTED);
    right(page, v, A4.w - M - 6, y, 9);
    y -= 15;
  }
  y -= 10;
  page.drawRectangle({ x: tx - 8, y: y - 10, width: 208, height: 28, color: INK });
  text(page, isCredit ? 'Amount refunded' : 'Total', tx, y, 10.5, bold, rgb(1, 1, 1));
  right(page, rupees(invoice.total), A4.w - M - 6, y, 12, bold, rgb(1, 1, 1));
  y -= 26;
  for (const t of invoice.taxLines) {
    right(page, `Includes GST ${t.rate}%: taxable ${rupees(t.taxable)}, GST ${rupees(t.amount)}`, A4.w - M - 6, y, 7.5, regular, MUTED);
    y -= 11;
  }
  if (!invoice.taxLines.length) {
    right(page, 'Prices are inclusive of all taxes.', A4.w - M - 6, y, 7.5, regular, MUTED);
    y -= 11;
  }

  // Payment summary (left of the totals)
  let py = y + 36 + rows.length * 15 + 12;
  text(page, isCredit ? 'REFUNDED BY' : 'PAYMENT', M, py, 7, bold, MUTED);
  py -= 13;
  for (const p of invoice.payments) {
    text(page, `${METHOD_LABEL[p.method] ?? p.method}  ${rupees(p.amount)}${p.reference ? `  ·  Ref ${p.reference}` : ''}`, M, py, 8.5);
    py -= 12;
  }
  if (invoice.refundedAmount && !isCredit) {
    text(page, `Refunded so far: ${rupees(invoice.refundedAmount)}`, M, py, 8.5, regular, WOOD);
  }

  // --- Footer ---------------------------------------------------------------
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawRectangle({ x: M, y: M + 24, width: A4.w - 2 * M, height: 0.8, color: LINE });
    const foot = invoice.footer ?? 'Thank you for choosing Karthys Gallery.';
    wrap(foot, regular, 7.5, A4.w - 2 * M - 80).forEach((l, j) => text(p, l, M, M + 12 - j * 10, 7.5, regular, MUTED));
    right(p, `Page ${i + 1} of ${pages.length}`, A4.w - M, M + 12, 7.5, regular, MUTED);
    right(p, 'Computer-generated document; no signature required.', A4.w - M, M + 2, 6.5, regular, MUTED);
  });

  return pdf.save();
}
