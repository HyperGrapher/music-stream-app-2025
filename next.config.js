/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
    images: {
        remotePatterns: [new URL('https://placehold.co/**'), new URL('https://loremflickr.com/**')],
      },
    // Embeds may be framed anywhere; every other page only by itself (clickjacking).
    async headers() {
        return [
            { source: "/embed/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }] },
            { source: "/((?!embed/).*)", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }, { key: "X-Frame-Options", value: "SAMEORIGIN" }] },
        ];
    },
};


export default config;
