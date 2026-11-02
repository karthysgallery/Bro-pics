'use client';

import { useEffect, useState } from 'react';

interface WhatsAppButtonProps {
  phoneNumber: string;
  message: string;
}

const HINT_SEEN_KEY = 'kg-wa-hint-seen';

/**
 * The floating "chat with us" button. It is WhatsApp green with a soft pulse, slides a short
 * "Need help?" bubble out once per visit, and tucks away while the shopper scrolls down so it never
 * sits on top of what they are reading; it comes back as soon as they stop or scroll up.
 */
export function WhatsAppButton({ phoneNumber, message }: WhatsAppButtonProps) {
  const href = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
  const [hidden, setHidden] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    let lastY = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    // Listen on capture so scrolls inside the shop's scroll container are heard too, not just the window's.
    const onScroll = (e: Event) => {
      const el = e.target === document ? document.scrollingElement : (e.target as Element);
      if (!(el instanceof Element) || el.scrollHeight - el.clientHeight < 400) return;
      const y = el.scrollTop;
      if (y > lastY + 4 && y > 200) setHidden(true);
      else if (y < lastY - 4) setHidden(false);
      lastY = y;
      clearTimeout(idle);
      idle = setTimeout(() => setHidden(false), 900);
    };
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      clearTimeout(idle);
    };
  }, []);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(HINT_SEEN_KEY) === '1';
    } catch {}
    if (seen) return;
    const show = setTimeout(() => {
      setHint(true);
      try {
        sessionStorage.setItem(HINT_SEEN_KEY, '1');
      } catch {}
    }, 2500);
    const hide = setTimeout(() => setHint(false), 8500);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  return (
    <div className={`wa-fab fixed bottom-4 right-4 md:bottom-6 md:right-6 z-30 flex items-center gap-2 pointer-events-none transition-all duration-300 ease-out ${hidden ? 'translate-x-[calc(100%+1.5rem)] opacity-0' : '[&>a]:pointer-events-auto'}`}>
      <span
        aria-hidden={!hint}
        className={`wa-hint whitespace-nowrap rounded-full bg-paper px-3.5 py-2 text-xs font-semibold text-ink shadow-lg ring-1 ring-line transition-all duration-300 ${hint ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-3 pointer-events-none'}`}
      >
        Need help? Chat with us
      </span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        onMouseEnter={() => setHint(true)}
        onMouseLeave={() => setHint(false)}
        className="wa-btn relative flex h-12 w-12 md:h-14 md:w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_8px_24px_-6px_rgba(37,211,102,0.55)] transition-transform duration-200 hover:scale-105 active:scale-95"
      >
        <span className="wa-ring absolute inset-0 rounded-full" aria-hidden="true" />
        <svg className="relative h-6 w-6 md:h-7 md:w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.6-1.2.1-.2 0-.4 0-.5l-.8-1.8c-.2-.4-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3c-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.5-.3Z" />
        </svg>
      </a>
    </div>
  );
}
