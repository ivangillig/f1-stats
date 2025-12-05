/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${process.env.INTERNAL_PROXY_URL || "http://f1-proxy:4000"}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
