/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0a0b',
          900: '#101012',
          850: '#16161a',
          800: '#1d1d22',
          700: '#2a2a31',
          600: '#3a3a44',
        },
      },
    },
  },
  plugins: [],
}
