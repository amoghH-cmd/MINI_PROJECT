export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#14283e', gov: '#096b61', govdark: '#07564e',
        paper: '#f4f7fa', line: '#dce5ec', ink: '#203449', muted: '#53677c',
        ok: '#18704c', warn: '#875408', bad: '#aa3143',
      },
      fontFamily: { sans: ['Inter', '"Segoe UI"', 'sans-serif'] },
      borderRadius: { DEFAULT: '8px', md: '10px' },
    },
  },
  plugins: [],
};
