import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / node-only modules that must not be bundled by Turbopack/webpack.
  serverExternalPackages: [
    "better-sqlite3",
    "sqlite-vec",
    "chokidar",
    "pdfjs-dist",
    "tesseract.js",
    "mammoth",
  ],
  // Ingestion routes handle big files.
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default nextConfig;
