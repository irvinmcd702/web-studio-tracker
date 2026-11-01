import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ships a self-contained server bundle, so the runtime image needs neither
  // node_modules nor the source tree.
  output: "standalone",
  experimental: {
    serverActions: {
      // Attachments are uploaded through server actions.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
