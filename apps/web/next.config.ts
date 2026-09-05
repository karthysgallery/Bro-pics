import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@bro-pics/shared'],
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

export default nextConfig;
