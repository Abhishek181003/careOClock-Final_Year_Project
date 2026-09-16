/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // --- Base shell (used everywhere, both registers) ---
        paper: '#F6F7F5', // warm-cool off-white, not the cliché cream
        surface: '#FFFFFF',
        ink: '#1F2E2C', // deep teal-charcoal, not flat black
        'ink-soft': '#4B5A57',
        line: '#DCE4E1',

        // --- Brand ---
        brand: {
          DEFAULT: '#1D6F64', // deep healing teal — also the "Stable" clinical color
          dark: '#154F47',
          light: '#BFE3D3', // soft mint, calm surface fills
        },

        // --- Time-of-day accents: WAYFINDING ONLY, never clinical meaning ---
        dawn: '#E8A24D', // morning check-in
        dusk: '#5B5A8C', // evening check-in

        // --- Clinical severity: ONLY ever used on RiskBadge / alert banners,
        // always paired with an icon + text label, never color alone (WCAG 1.4.1) ---
        tier: {
          stable: '#1D6F64',
          moderate: '#B8863A',
          high: '#C56A3F',
          critical: '#A6423B',
        },
      },
      fontFamily: {
        // Manrope carries personality in headlines.
        // Noto Sans is the workhorse: it covers Devanagari and most Indic scripts,
        // which matters more here than a trendier UI face — a functional choice, not decoration.
        display: ['Manrope', 'Noto Sans', 'system-ui', 'sans-serif'],
        body: ['Noto Sans', 'Manrope', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Base sits at 16px minimum; body defaults to 18px app-wide — a deliberate
        // step above the WCAG floor for an elderly-heavy user base.
        base: ['1rem', '1.5rem'],
        body: ['1.125rem', '1.75rem'],
        h3: ['1.25rem', '1.75rem'],
        h2: ['1.5rem', '2rem'],
        h1: ['2rem', '2.5rem'],
        display: ['2.5rem', '3rem'],
      },
      borderRadius: {
        // Radius is semantic, not decorative: soft for the patient "ritual" surfaces,
        // near-flat for the doctor's dense triage grid. See DESIGN_SYSTEM.md.
        ritual: '20px',
        clinical: '4px',
      },
      boxShadow: {
        ritual: '0 8px 24px -12px rgba(31, 46, 44, 0.18)',
      },
    },
  },
  plugins: [],
};
