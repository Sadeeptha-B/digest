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
        // Semantic accent. A muted, desaturated green (sage). Single source of
        // truth for the brand color — use `accent-*` utilities in components
        // rather than a raw palette name so re-theming is a one-file change.
        // Keep `accent-400` in sync with FG in scripts/generate-icons.mjs.
        accent: {
          300: '#a3c9b5',
          400: '#7faf93',
          500: '#5f9175',
          600: '#4a755d',
          700: '#3a5c49',
        },
      },
    },
  },
  plugins: [],
}
