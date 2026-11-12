import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API responses are live queue/settings state — never let the browser cache them.
  async headers() {
    return [{ source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] }];
  },
};

export default nextConfig;
