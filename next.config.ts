import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@google-cloud/secret-manager"],
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
        source: "/preview",
        destination: "/",
        permanent: false,
      },
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
