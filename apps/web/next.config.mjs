/**
 * The web application talks to the API over HTTP, from the server side.
 *
 * `@ecms/contracts` is transpiled rather than consumed as a built package, so a
 * change to a shared schema is picked up without a separate build step in
 * development — and so the two applications provably validate against the same
 * definition rather than against two copies that have drifted.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ecms/contracts'],
  poweredByHeader: false,
  typedRoutes: false,
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
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
