import type { NextConfig } from 'next';
import withBundleAnalyzerInit from '@next/bundle-analyzer';

const withBundleAnalyzer = withBundleAnalyzerInit({ enabled: process.env.ANALYZE === 'true' });

const nextConfig: NextConfig = {
  transpilePackages: ['@bro-pics/shared'],
  // sharp ships a native .node binary — webpacking it into the API route
  // bundle (Next's default for server code) breaks its native binding at
  // runtime, even though it works fine when required directly (e.g. a
  // standalone Node script). serverExternalPackages keeps it as a plain
  // Node `require` instead, which is the supported way to use native
  // modules in Next.js route handlers. Without this, POST /api/uploads
  // always fails with "Unable to process image" for every real file.
  serverExternalPackages: ['sharp'],
  images: {
    // Google's shared image-serving hostname for ALL public GCS buckets is
    // storage.googleapis.com — an unscoped remotePattern would let any
    // attacker-influenced src proxy arbitrary third-party buckets through
    // this app's image optimizer. Scope to this project's actual Firebase
    // Storage bucket (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET), which is always
    // the first path segment for storage.googleapis.com/<bucket>/<object> URLs.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/bropics-app.firebasestorage.app/**',
      },
    ],
  },
};

export default withBundleAnalyzer(nextConfig);
