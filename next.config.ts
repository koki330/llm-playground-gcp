import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals.push("shiki/wasm");
    return config;
  },
};

export default nextConfig;