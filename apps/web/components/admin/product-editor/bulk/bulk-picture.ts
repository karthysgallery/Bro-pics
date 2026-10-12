'use client';

/** A picture's real pixel size and a small thumbnail, read once so a long list of big files stays light. */
export async function readPicture(file: File): Promise<{ width: number; height: number; thumb: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This file is not a picture the browser can read.'));
      el.src = url;
    });
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    const scale = Math.min(1, 160 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { width, height, thumb: canvas.toDataURL('image/jpeg', 0.7) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
