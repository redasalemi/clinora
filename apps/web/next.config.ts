import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets Next.js load packages/engine straight from TypeScript source,
  // since it has no build step of its own (npm workspaces symlink it in).
  transpilePackages: ["@clinora/engine"],
};

export default nextConfig;
