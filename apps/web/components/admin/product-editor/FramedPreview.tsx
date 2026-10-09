'use client';

import { useEffect, useState } from 'react';
import { frameDesign, STOCK_FRAME, type FrameLook } from '../../customizer/frame-moulding';

export const SAMPLE_PHOTO = '/placeholders/home/hero-sample-photo.jpg';

/** Crops a picture to a print shape (centre) in the browser, so the preview has the real proportions. */
async function cropToShape(src: string, widthIn: number, heightIn: number): Promise<string | null> {
  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = src;
  });
  if (!img) return null;
  const target = widthIn / heightIn;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w / h > target) w = Math.round(h * target);
  else h = Math.round(w / target);
  const scale = Math.min(1, 900 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')?.drawImage(img, (img.naturalWidth - w) / 2, (img.naturalHeight - h) / 2, w, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

/** A picture shown inside a frame model at a size — what the customer will see. */
export function FramedPreview({
  src = SAMPLE_PHOTO,
  look,
  widthIn = 8,
  heightIn = 12,
  label,
  className = '',
}: {
  src?: string;
  look: FrameLook | null;
  widthIn?: number;
  heightIn?: number;
  label?: string;
  className?: string;
}) {
  const [framed, setFramed] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setFramed(null);
    (async () => {
      const cropped = await cropToShape(src, widthIn, heightIn);
      if (!cropped) return;
      const out = await frameDesign(cropped, widthIn, look ?? STOCK_FRAME);
      if (alive) setFramed(out ?? cropped);
    })();
    return () => {
      alive = false;
    };
  }, [src, look?.src, look?.borderPx, look?.mouldingWidthIn, widthIn, heightIn]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <figure className={`flex flex-col items-center gap-1.5 ${className}`}>
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-[radial-gradient(circle_at_50%_40%,#f4efe6,#e4dccd)] p-4">
        {framed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={framed} alt={label ?? 'Frame preview'} className="max-h-full max-w-full object-contain drop-shadow-[0_10px_18px_rgba(40,25,10,0.35)]" />
        ) : (
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/20 border-t-ink/60" aria-label="Loading preview" />
        )}
      </div>
      {label && <figcaption className="text-center text-2xs text-ink/60">{label}</figcaption>}
    </figure>
  );
}

/** FrameLook from a frame model's picture (or null when it has none: the stock frame is used). */
export function lookOf(model: { image: { url: string; borderPx: number } | null; mouldingWidthIn: number } | null | undefined): FrameLook | null {
  return model?.image ? { src: model.image.url, borderPx: model.image.borderPx, mouldingWidthIn: model.mouldingWidthIn } : null;
}
