export interface GstSplit {
  taxableValuePaise: number;
  gstAmountPaise: number;
}

/**
 * [BE-22] Reverse-splits a GST-INCLUSIVE total (this project's prices are
 * quoted to customers all-in, the standard B2C convention in India) into
 * its taxable value and GST amount, for display on a GST invoice — never
 * to add extra tax on top of what the customer already paid.
 * taxableValue * (1 + rate/100) = total, so taxableValue = total / (1 + rate/100).
 * Rounds the GST amount and derives taxableValue as the remainder, so the
 * two always sum back to the exact original total paise (never off-by-one
 * from rounding both independently).
 */
export function splitGstFromInclusiveTotal(totalPaise: number, ratePercent: number): GstSplit {
  if (ratePercent <= 0) return { taxableValuePaise: totalPaise, gstAmountPaise: 0 };
  const taxableValuePaise = Math.round(totalPaise / (1 + ratePercent / 100));
  const gstAmountPaise = totalPaise - taxableValuePaise;
  return { taxableValuePaise, gstAmountPaise };
}
