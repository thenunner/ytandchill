import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4098,
    host: true, // Listen on all network interfaces (0.0.0.0)
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'https://localhost:4099',
        changeOrigin: true,
        secure: false  // Accept self-signed certificates
      },
      '/media': {
        target: process.env.VITE_API_URL || 'https://localhost:4099',
        changeOrigin: true,
        secure: false  // Accept self-signed certificates
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
