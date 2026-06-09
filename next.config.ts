import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 defaults to Turbopack. The empty object opts in explicitly
  // and silences the "webpack config but no turbopack config" warning.
  turbopack: {},

  webpack(config, { isServer }) {
    if (!isServer) {
      // ExcelJS uses Node.js built-ins that don't exist in the browser.
      // Stub them out so the client bundle compiles correctly.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        stream: false,
        crypto: false,
        buffer: false,
        os: false,
      };
    }
    return config;
  },
};

export default nextConfig;
