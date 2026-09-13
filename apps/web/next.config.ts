import type { NextConfig } from 'next';
import withBundleAnalyzerInit from '@next/bundle-analyzer';

const withBundleAnalyzer = withBundleAnalyzerInit({ enabled: process.env.ANALYZE === 'true' });

const nextConfig: NextConfig = {
  transpilePackages: ['@bro-pics/shared'],
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
  webpack: (config) => {
    // konva resolves to its Node-specific entry (lib/index-node.js) during
    // webpack's module-graph build, which does `require('canvas')` — an
    // optional native binding never actually used in the browser (canvas
    // is native there) and never installed in this project. next/dynamic's
    // ssr:false controls RUNTIME execution, not webpack's build-time module
    // resolution, so the two fixes are independent — this fallback is what
    // stops webpack from erroring on a module it will never call.
    config.resolve.fallback = { ...config.resolve.fallback, canvas: false };
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
