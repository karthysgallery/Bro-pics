/**
 * One rupee formatter for the whole storefront, so a price never renders as
 * ₹799 in one place and ₹799.00 in another. Catalogue prices are whole rupees
 * far more often than not and a column of trailing ".00" is noise, so the
 * decimals appear only when the amount actually has paise.
 */
export function formatPaise(paise: number): string {
  const hasPaise = paise % 100 !== 0;
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
