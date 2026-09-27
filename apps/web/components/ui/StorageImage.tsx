import Image, { type ImageProps } from 'next/image';
import type { ReactNode } from 'react';
import { useMediaUrl } from '../../lib/use-media-url';
import { Skeleton } from './Skeleton';

interface StorageImageProps extends Omit<ImageProps, 'src'> {
  /** A Storage object path (never a URL) — resolved to a fresh signed URL via useMediaUrl. */
  path: string | null | undefined;
  /** Rendered in place of the image while the path is resolving or absent. */
  fallback?: ReactNode;
}

// [FE-03] The one place a component should render an image from a Storage
// path — resolves it via useMediaUrl (never persists or reuses a stale
// signed URL) and shows `fallback` (a skeleton by default) until resolved.
export function StorageImage({ path, fallback, className, ...imageProps }: StorageImageProps) {
  const url = useMediaUrl(path);

  if (!url) {
    return fallback !== undefined ? (
      <>{fallback}</>
    ) : (
      <Skeleton className={className ?? 'w-full h-full'} />
    );
  }

  return <Image src={url} className={className} {...imageProps} />;
}
