/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:       '#0f0f11',
        surface:  '#161619',
        surface2: '#1e1e23',
        surface3: '#26262d',
        accent:   '#7c6ff7',
        accent2:  '#a599ff',
        green:    '#34c98a',
        amber:    '#f5a623',
        red:      '#e55555',
        pink:     '#e26faf',
        blue:     '#4f9cf7',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body:    ['DM Sans', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
        btn:  '7px',
        pill: '999px',
      },
    },
  },
  plugins: [],
}
