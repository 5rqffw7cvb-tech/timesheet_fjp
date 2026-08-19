import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
