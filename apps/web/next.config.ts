import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@stocklens/shared', '@stocklens/ui'],
};

export default nextConfig;
