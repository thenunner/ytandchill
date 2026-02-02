import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4098,
    host: true, // Listen on all network interfaces (0.0.0.0)
    proxy: {
      '/api': {
        target: 'http://192.168.168.245:4099',
        changeOrigin: true
      },
      '/media': {
        target: 'http://192.168.168.245:4100',
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
          'query-vendor': ['@tanstack/react-query'],
          'router-vendor': ['react-router-dom']
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
