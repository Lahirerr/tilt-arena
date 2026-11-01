import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the shared package ships raw TypeScript
  transpilePackages: ["@tilt/shared"],
  // let phones open the dev server through a tunnel or your LAN IP
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "192.168.*.*",
    "10.*.*.*",
  ],
};

export default nextConfig;
