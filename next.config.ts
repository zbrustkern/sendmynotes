import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/refund-policy",
        destination: "/return-policy",
        permanent: true,
      },
      {
        source: "/refunds",
        destination: "/return-policy",
        permanent: true,
      },
      {
        source: "/returns",
        destination: "/return-policy",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
