/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // YouTube-inspired accent
        accent: {
          DEFAULT: '#e5e7eb',
          hover: '#ffffff',
        },
        // Custom dark palette from test files
        dark: {
          primary: '#000000',    // Pure black background
          secondary: '#14161a',  // Card backgrounds
          tertiary: '#1a1d23',   // Elevated surfaces
          hover: '#3a3d44',      // Hover states
          border: '#2a2d32',     // Borders
          'border-light': '#3a3d44', // Lighter borders
        },
        text: {
          primary: '#e6e8f0',
          secondary: '#9ca3ba',
          muted: '#6b7280',
        }
      },
      fontFamily: {
        mono: ['Courier New', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'lift': 'lift 0.2s ease-out',
        'gradient-border': 'gradientBorder 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        lift: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-2px)' },
        },
        gradientBorder: {
          '0%': { transform: 'scaleX(0)' },
          '50%': { transform: 'scaleX(0.5)' },
          '100%': { transform: 'scaleX(1)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(229, 231, 235, 0.1)',
        'card': '0 2px 8px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 8px 16px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
}
