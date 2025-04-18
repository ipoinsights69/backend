/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    MONGODB_URI: process.env.MONGODB_URI,
    API_CACHE_TIME: process.env.API_CACHE_TIME || '60',
  },
  experimental: {
    optimizeCss: true,
  },
  // Image optimization
  images: {
    domains: ['www.chittorgarh.com'],
    formats: ['image/avif', 'image/webp'],
  },
  // Optimize font loading
  optimizeFonts: true,
  // Configure headers for security and caching
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig; 