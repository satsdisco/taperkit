/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#1a1a1a',
        surface: '#242424',
        border: '#333333',
        accent: '#ff8c42',
        'accent-hover': '#ff6b00',
        text: '#e8e8e8',
        'text-muted': '#888888',
        success: '#4caf50',
        warning: '#ff9800',
        error: '#f44336',
      },
    },
  },
  plugins: [],
}
