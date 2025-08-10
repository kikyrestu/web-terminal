/** @type {import('next').NextConfig} */
const nextConfig = {
  // Konfigurasi untuk node-pty
  transpilePackages: ['@xterm/xterm'],
  // Handle websocket upgrade requests
  webpack: (config, { isServer }) => {
    // Fixes npm packages that depend on `fs` module
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;
