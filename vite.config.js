// Build settings for hosting (Firebase Hosting serves the dist/ folder). `base: './'` keeps asset URLs relative, so the
// game works at the site root or under a sub-path; Three.js goes into its own chunk so the game code can cache separately.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined)
      }
    }
  }
});
