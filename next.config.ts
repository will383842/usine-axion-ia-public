import type { NextConfig } from "next";

const enDev = process.env.NODE_ENV !== "production";

/** CSP compatible Next (App Router) : les scripts en ligne de Next exigent 'unsafe-inline' sans nonce. */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${enDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${enDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Image Docker autonome (Dockerfile) : seul le nécessaire est copié.
  output: "standalone",
  serverExternalPackages: ["@node-rs/argon2", "pg"],
  async headers() {
    return [
      {
        source: "/:chemin*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
