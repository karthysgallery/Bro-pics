'use client';

import Image from 'next/image';

interface LightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

// Full-screen image viewer, extracted from Gallery's original inline zoom
// modal so PersonalizationEditor's Preview button (Task 6) can reuse the
// identical pattern instead of a second near-identical overlay. Clicking
// anywhere on the backdrop — including the image itself — closes it, which
// matches Gallery's pre-extraction behavior exactly, not a new interaction.
export function Lightbox({ src, alt, onClose }: LightboxProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-ink/90 flex items-center justify-center p-4 cursor-zoom-out"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        aria-label="Close preview"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-paper text-ink flex items-center justify-center text-2xl leading-none hover:bg-tint transition-colors"
      >
        &times;
      </button>
      <div className="relative w-full h-full">
        <Image src={src} alt={alt} fill sizes="100vw" className="object-contain" />
      </div>
    </div>
  );
}
