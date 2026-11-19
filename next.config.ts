import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@google-cloud/secret-manager"],
  outputFileTracingIncludes: {
    "/api/upload/**": ["./lib/upload/*.woff"],
    "/api/wedding/import": [
      "./lib/wedding/import-worker.cjs",
      "./node_modules/yauzl/**/*",
      "./node_modules/pend/**/*",
      "./node_modules/saxes/**/*",
      "./node_modules/xmlchars/**/*",
      "./node_modules/csv-parse/**/*",
    ],
    "/api/wedding/**": [
      "./lib/wedding/artwork-worker.cjs",
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
      "./node_modules/opentype.js/**/*",
      "./public/presets/love-roses.jpg",
      "./lib/upload/*.woff",
      "./public/presets/thank-you-botanical.jpg",
      "./public/presets/thank-you-laurel-wreath.jpg",
    ],
  },
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
