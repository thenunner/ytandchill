import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4098,
    proxy: {
      '/api': {
        target: 'http://localhost:4099',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false, // Disable source maps in production
    rollupOptions: {
      output: {
        manualChunks: {
          'video-vendor': ['video.js'],
          'query-vendor': ['@tanstack/react-query'],
          'router-vendor': ['react-router-dom']
          // NO plyr-vendor - Plyr was removed in Tier 2
        }
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false // Keep console.logs for debugging
      }
    }
  }
})
