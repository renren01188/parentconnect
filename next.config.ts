import type { NextConfig } from "next";

// Do not let production start with the old, source-visible JWT fallback.
// This runs for builds and server starts, before any route can issue a token.
if (process.env.NODE_ENV === "production" && (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length < 24)) {
  throw new Error("NEXTAUTH_SECRET must be set to a random value of at least 24 characters in production.");
}

const nextConfig: NextConfig = {
  // Next.js 16 defaults to Turbopack. The empty object opts in explicitly
  // and silences the "webpack config but no turbopack config" warning.
  // Keep tracing and Turbopack inside this application when a parent folder
  // also contains a lockfile.
  turbopack: { root: __dirname },

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
