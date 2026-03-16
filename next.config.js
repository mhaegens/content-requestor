/** @type {import('next').NextConfig} */

const { execSync } = require('child_process');

let buildSha = 'dev';
try {
  buildSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch { /* not a git repo or git not available */ }

// Total commit count — auto-increments with every push, giving a monotonic
// build number that's more meaningful than a date when pushing multiple times
// per day.
let buildCount = '0';
try {
  buildCount = execSync('git rev-list --count HEAD').toString().trim();
} catch { /* not a git repo or git not available */ }

const isDev = process.env.NODE_ENV === 'development';

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js hydration requires unsafe-inline; unsafe-eval only needed in dev
      isDev
        ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      // TMDB poster CDN — only image source from an external origin
      "img-src 'self' https://image.tmdb.org data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig = {
  // Embed git SHA and build timestamp into the client bundle so the footer
  // can confirm which exact build is running. NEXT_PUBLIC_ prefix guarantees
  // the values are inlined at build time in both server and client components.
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildSha,
    NEXT_PUBLIC_BUILD_COUNT: buildCount,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
  // better-sqlite3 is a native Node.js addon (.node file).
  // `experimental.serverComponentsExternalPackages` is documented to cover
  // both Server Components and Route Handlers, but in practice it only
  // reliably excludes Server Components from the webpack bundle in Next.js
  // 14.x.  The explicit `webpack.externals` below is the guaranteed path:
  // it patches *every* server-side compilation pass (server components,
  // route handlers, middleware) so `require('better-sqlite3')` is left as a
  // native Node.js require rather than being inlined by webpack.
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent webpack from bundling better-sqlite3 in any server-side pass.
      // Without this the native .node addon cannot resolve its binary at
      // runtime and every call to /api/requests returns 500.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        'better-sqlite3',
      ];
    }
    return config;
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: securityHeaders,
    },
  ],
  // Expose NO env vars to the client bundle.
  // TMDB_READ_TOKEN is server-only — never listed in `env` or `publicRuntimeConfig`.
};

module.exports = nextConfig;
