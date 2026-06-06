/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  compiler: {
    // Strip console.log/debug in production builds; keep error and warn.
    removeConsole: process.env.NODE_ENV === "production"
      ? { exclude: ["error", "warn"] }
      : false,
  },
  // Disable gzip so the /api/proxy SSE rewrite streams events immediately.
  // With compression on, Next buffers text/event-stream frames and the
  // browser hangs on "waiting for data". Compression for normal assets
  // should be handled by the edge/reverse proxy in front of this app.
  compress: false,
  async rewrites() {
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${
          process.env.INTERNAL_PROXY_URL || "http://f1-proxy:4000"
        }/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
