import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Opt-out packages that use Node.js-native or WebSocket features from bundling.
  // Required for msedge-tts (uses 'ws' WebSocket) to work in Vercel serverless.
  serverExternalPackages: ['msedge-tts', 'ws', 'isomorphic-ws', 'fluent-ffmpeg'],
};

export default nextConfig;
