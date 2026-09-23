import type { NextConfig } from 'next';
import withBundleAnalyzerInit from '@next/bundle-analyzer';

const withBundleAnalyzer = withBundleAnalyzerInit({ enabled: process.env.ANALYZE === 'true' });

// [BE-34] Static, route-independent security headers. The CSP itself is
// NOT here — it needs a per-request nonce, so it's set in middleware.ts
// instead, as Content-Security-Policy-Report-Only (report-only first,
// per this task's own two-phase plan: observe violations against real
// traffic before ever enforcing — this session has no way to observe
// that traffic, so flipping straight to enforcing would risk silently
// breaking the site with no way to notice).
async function securityHeaders() {
  return [
    {
      source: '/:path*',
      headers: [
        // HSTS only makes sense once the whole app is served over HTTPS
        // (true for both Firebase App Hosting and the Vercel demo deploy)
        // — includeSubDomains + preload since this is a fresh domain with
        // no legacy HTTP subdomains to break.
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        // Same protection CSP's frame-ancestors also provides — kept for
        // older browsers that don't honor frame-ancestors.
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // Deny every sensitive permission by default — nothing in this
        // app currently needs camera/mic/geolocation/etc.
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
      ],
    },
  ];
}

const nextConfig: NextConfig = {
  transpilePackages: ['@bro-pics/shared'],
  headers: securityHeaders,
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
