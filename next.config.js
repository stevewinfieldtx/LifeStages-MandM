/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Heavy native deps used by the embedded renderer (instrumentation.ts).
  // Bundling these breaks because they ship platform-specific .node binaries
  // and FFI shims that can't be statically analyzed.
  serverExternalPackages: [
    "@napi-rs/canvas",
    "sharp",
    "fluent-ffmpeg",
    "ffmpeg-static"
  ],
  // Increase timeout for long-running API routes (MM pipeline takes 30-90 seconds)
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    }
  }
};

module.exports = nextConfig;
