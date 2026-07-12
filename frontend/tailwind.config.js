export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: '#141A2B',
        paper: '#F2F4EE',
        card: '#FFFFFF',
        emerald: { DEFAULT: '#1E6F55', dark: '#154F3D' },
        brass: '#B9862E',
        charcoal: '#242A32',
        muted: '#6B7280',
        rose: '#B24B41',
      },
      fontFamily: {
        display: ['"Fraunces"', 'serif'],
        body: ['"Work Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
}
