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
};

export default nextConfig;
