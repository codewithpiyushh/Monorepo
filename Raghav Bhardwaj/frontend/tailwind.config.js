/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f4f7',
          100: '#e2e7ed',
          300: '#b8c1cb',
          400: '#98a3af',
          500: '#7b8794',
          600: '#677381',
          700: '#586572',
        },
        surface: {
          900: '#181a1d',
          800: '#22262b',
          700: '#2b3036',
          600: '#3b434d',
        },
      },
    },
  },
  plugins: [],
}
