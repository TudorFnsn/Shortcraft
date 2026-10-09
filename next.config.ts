import type { NextConfig } from 'next';

// The in-house renderer spawns ffmpeg; Vercel functions ship none. The static
// build from `ffmpeg-static` is never imported (see ffmpeg-binary.ts), so the
// tracer can't find it: include it by hand in every route that renders.
const FFMPEG = ['./node_modules/ffmpeg-static/ffmpeg', './node_modules/ffmpeg-static/ffmpeg.exe'];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/jobs': FFMPEG,
    '/api/cron/advance-jobs': FFMPEG,
  },
};

export default nextConfig;
