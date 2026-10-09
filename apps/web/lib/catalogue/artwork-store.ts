import 'server-only';
import sharp from 'sharp';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../firebase-admin';
import type { ArtworkStore } from './product-setup';

/** Crops ready-made artwork to each print shape with sharp, in the shop's own bucket (public/ prefix). */
export function storageArtworkStore(): ArtworkStore {
  const bucket = getStorage(getAdminApp()).bucket();
  return {
    async cropTo(sourcePath, crop, destPath) {
      const [source] = await bucket.file(sourcePath).download();
      const out = await sharp(source, { limitInputPixels: 400_000_000 }).rotate().extract(crop).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer({ resolveWithObject: true });
      await bucket.file(destPath).save(out.data, { contentType: 'image/jpeg', resumable: false, metadata: { cacheControl: 'public, max-age=31536000' } });
      return { widthPx: out.info.width, heightPx: out.info.height, sizeBytes: out.data.length };
    },
  };
}
