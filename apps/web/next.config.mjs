/**
 * The web application talks to the API over HTTP, from the server side.
 *
 * `@ecms/contracts` is transpiled rather than consumed as a built package, so a
 * change to a shared schema is picked up without a separate build step in
 * development — and so the two applications provably validate against the same
 * definition rather than against two copies that have drifted.
 */
// Report-only CSP — logs violations to the browser console without breaking
// the app. Switch the header name to 'Content-Security-Policy' once violations
// have been reviewed and the policy is confirmed clean.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // 'unsafe-inline' required by Next.js inline scripts; tighten with nonces later
  "style-src 'self' 'unsafe-inline'", // required by Next.js CSS-in-JS
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy-Report-Only', value: CSP },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  transpilePackages: ['@ecms/contracts'],
  poweredByHeader: false,
  typedRoutes: false,
  experimental: {
    serverActions: {
      // Document uploads (createDocument, apps/web/src/app/(app)/projects/[id]/documents/actions.ts)
      // go through a Server Action, whose body is capped by Next at 1MB by
      // default — well under the API's own 50MB limit
      // (documents.controller.ts's MAX_UPLOAD_BYTES). A real scanned deed
      // like MULKIA 25.S.101.pdf (1.05MB) silently fails at exactly this gap.
      // Matched to the API's real cap, not raised arbitrarily.
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
