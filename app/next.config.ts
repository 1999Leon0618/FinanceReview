import type { NextConfig } from "next";

const appCommit = (
  process.env.GITHUB_SHA ??
  process.env.CF_PAGES_COMMIT_SHA ??
  "local"
).slice(0, 7);

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? "0.1.0",
    NEXT_PUBLIC_APP_COMMIT: appCommit,
    NEXT_PUBLIC_APP_BUILT_AT:
      process.env.APP_BUILD_TIME ?? new Date().toISOString(),
    NEXT_PUBLIC_APP_ENVIRONMENT:
      process.env.APP_DEPLOYMENT_ENVIRONMENT ?? "local",
  },
};

export default nextConfig;
