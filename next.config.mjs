/** @type {import('next').NextConfig} */
const nextConfig = {
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
