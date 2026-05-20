/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Assistant', 'Heebo', 'system-ui', 'sans-serif'],
        serif: ['Frank Ruhl Libre', 'Georgia', 'serif'],
      },
      colors: {
        cream: {
          50: '#fefcf7',
          100: '#fdf8eb',
          200: '#f9eed1',
          300: '#f3e0b0',
        },
      },
    },
  },
  plugins: [],
};
