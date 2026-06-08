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
        // Semantic accent — the "focus" brand color. Resolved from CSS variables
        // (see src/index.css) so the palette can be swapped live via the header
        // theme switcher; the channel + `<alpha-value>` form keeps the `/opacity`
        // modifiers (e.g. accent-600/20) working. Default palette is indigo; the
        // icon FG in scripts/generate-icons.mjs + public/favicon.svg mirror it.
        accent: {
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
        },
        // Warm (or, for the terracotta theme, cool) counterpart reserved for
        // break / rest states so color carries meaning: focus vs. break.
        rest: {
          300: 'rgb(var(--rest-300) / <alpha-value>)',
          400: 'rgb(var(--rest-400) / <alpha-value>)',
          500: 'rgb(var(--rest-500) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
