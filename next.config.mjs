/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": ["./public/data/**/*"],
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/maps",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

