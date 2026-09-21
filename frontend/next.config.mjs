import { createMDX } from 'fumadocs-mdx/next';
import { execSync } from 'child_process';

// Synchronously generate .source files before Turbopack/Webpack begins module resolution
try {
  execSync('npx fumadocs-mdx', { stdio: 'inherit' });
} catch (e) {
  console.warn('[Fumadocs] Pre-generation notice:', e);
}

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* existing config options preserved */
};

export default withMDX(nextConfig);
