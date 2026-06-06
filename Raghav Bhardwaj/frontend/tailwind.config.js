/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:      ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono:      ['JetBrains Mono', 'Consolas', 'Courier New', 'monospace'],
        condensed: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: {
          0:   'var(--surface-0)',
          1:   'var(--surface-1)',
          2:   'var(--surface-2)',
          3:   'var(--surface-3)',
          4:   'var(--surface-4)',
          5:   'var(--surface-5)',
          600: 'var(--surface-4)',
          700: 'var(--surface-3)',
          800: 'var(--surface-2)',
          900: 'var(--surface-1)',
        },
        /* EY Yellow brand scale */
        brand: {
          50:  '#FFFDE0',
          100: '#FFF9B0',
          200: '#FFF380',
          300: '#FFED4A',
          400: '#FFE600',   /* EY Yellow primary */
          500: '#FFE600',
          600: '#E6CF00',
          700: '#C8B200',
          800: '#A89400',
          900: 'var(--accent-subtle)',
        },
        accent: {
          primary:        'var(--accent)',
          'primary-strong':'var(--accent-active)',
        },
        /* EY brand colours */
        ey: {
          yellow:      '#FFE600',
          'off-black': '#2E2E38',
          'conf-black':'#1A1A24',
          'gray-1':    '#747480',
          'gray-2':    '#C4C4CD',
          'off-white': '#F6F6FA',
          orange:      '#FF7D1E',
          green:       '#00C864',
          red:         '#FF3C00',
          blue:        '#4696FF',
          teal:        '#32FFFF',
        },
        /* Slate maps to CSS vars so both themes work */
        slate: {
          100: 'var(--text-primary)',
          200: 'var(--text-primary)',
          300: 'var(--text-secondary)',
          400: 'var(--text-secondary)',
          500: 'var(--text-tertiary)',
          600: 'var(--text-tertiary)',
        },
        emerald: {
          300: '#6ee7b7',
          400: '#34d399',
          600: 'var(--ok)',
        },
        rose: {
          300: '#fda4af',
          400: '#fb7185',
        },
        amber: {
          300: '#FFE600',
          400: '#FFE600',
        },
      },
      borderColor: {
        DEFAULT: 'var(--border-1)',
      },
    },
  },
  plugins: [],
}
