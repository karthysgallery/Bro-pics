'use client';

import { useState } from 'react';

/**
 * The coupon code as a cut-out ticket with a copy button. "Copied" shows
 * what happened; if the clipboard is blocked the code stays selectable.
 */
export function OfferCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="diwali-ticket flex w-full items-stretch rounded-xl text-[#FFF3DF] sm:inline-flex sm:w-auto">
      <span className="flex min-w-0 flex-1 flex-col justify-center px-4 py-2">
        <span className="text-[11px] text-[#FFD27A]/80">Use code at checkout</span>
        <span className="select-all font-[family-name:var(--font-cinzel)] text-base font-semibold tracking-[0.08em] sm:text-xl sm:tracking-[0.12em]">{code}</span>
      </span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 whitespace-nowrap border-l border-dashed border-[#C99A3E]/70 px-4 text-sm font-semibold text-[#FFD27A] transition-colors hover:bg-[#FFD27A]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD27A]"
        aria-label={copied ? `Code ${code} copied` : `Copy code ${code}`}
      >
        <span aria-live="polite">{copied ? 'Copied' : 'Copy code'}</span>
      </button>
    </div>
  );
}
