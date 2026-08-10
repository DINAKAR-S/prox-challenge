/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The SDK locates its native CLI binary at runtime via
    // createRequire(import.meta.url).resolve(...) against its own sibling
    // platform package (e.g. @anthropic-ai/claude-agent-sdk-linux-x64).
    // Webpack bundling breaks that trick (require.resolve returns a
    // webpack module id, not a filesystem path), so the package must be
    // kept external and executed via real Node module resolution instead.
    serverComponentsExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
    // Ship the platform-specific native CLI binary (a sibling package,
    // not inside claude-agent-sdk itself) with the /api/chat serverless
    // function. Includes both glibc and musl linux variants since the
    // SDK auto-detects which one to spawn.
    outputFileTracingIncludes: {
      "/api/chat": [
        "./node_modules/@anthropic-ai/claude-agent-sdk/**",
        "./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/**",
        "./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/**",
      ],
    },
  },
};

module.exports = nextConfig;
