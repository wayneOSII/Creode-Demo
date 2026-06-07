/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: {
          bg: '#0f0f14',
          surface: '#1a1a24',
          border: '#2a2a3a',
          glow: '#6366f1',
          'glow-dim': 'rgba(99, 102, 241, 0.3)',
        },
        node: {
          default: '#1e1e2e',
          highlighted: '#2d2b55',
          dimmed: 'rgba(30, 30, 46, 0.4)',
          border: '#3b3b52',
          'border-highlight': '#818cf8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans TC', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': {
            boxShadow: '0 0 8px rgba(99, 102, 241, 0.4)',
          },
          '50%': {
            boxShadow: '0 0 20px rgba(99, 102, 241, 0.8)',
          },
        },
      },
    },
  },
  plugins: [],
};
