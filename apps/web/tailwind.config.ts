import type { Config } from 'tailwindcss'

/**
 * Design tokens extracted from the Stitch design system.
 * Source of truth: .stitch/designs/categorise.html
 *
 * Flat hyphenated keys are used throughout — nested color objects
 * can cause @apply resolution issues in some Tailwind/PostCSS setups.
 *
 * Usage:
 *   text-primary              → #006c44
 *   text-secondary            → #615e57
 *   text-on-surface           → #1b1c1b
 *   bg-surface                → #faf9f7  (page background)
 *   bg-surface-container-low  → #f4f3f1  (table headers, row hover)
 *   bg-secondary-container    → #e7e2d9  (chips, active nav, borders)
 *   text-tertiary             → #b02d29  (errors, negative amounts)
 *   shadow-ambient            → 0 0 24px rgba(27,28,27,0.04)
 *   shadow-ambient-lg         → 0 12px 40px rgba(27,28,27,0.04)
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Primary (green) ───────────────────────────────────────────────────
        'primary':                '#006c44',
        'primary-dim':            '#005235',
        'primary-container':      '#4caf7d',
        'primary-fixed':          '#93f7bf',
        'primary-fixed-dim':      '#77daa4',
        'on-primary':             '#ffffff',
        'on-primary-container':   '#003d25',

        // ── Secondary (warm grey) ─────────────────────────────────────────────
        'secondary':              '#615e57',
        'secondary-container':    '#e7e2d9',
        'secondary-fixed':        '#e7e2d9',
        'secondary-fixed-dim':    '#cbc6bd',
        'on-secondary':           '#ffffff',
        'on-secondary-container': '#67645d',

        // ── Tertiary (red / error) ────────────────────────────────────────────
        'tertiary':               '#b02d29',
        'tertiary-container':     '#ffdad6',
        'tertiary-fixed':         '#ffdad6',
        'on-tertiary':            '#ffffff',

        // ── Surface ───────────────────────────────────────────────────────────
        'surface':                    '#faf9f7',
        'surface-bright':             '#faf9f7',
        'surface-dim':                '#dbdad8',
        'surface-variant':            '#e3e2e0',
        'surface-container-lowest':   '#ffffff',
        'surface-container-low':      '#f4f3f1',
        'surface-container':          '#efeeec',
        'surface-container-high':     '#e9e8e6',
        'surface-container-highest':  '#e3e2e0',

        // ── On-surface ────────────────────────────────────────────────────────
        'on-surface':         '#1b1c1b',
        'on-surface-variant': '#3e4942',

        // ── Outline / border ──────────────────────────────────────────────────
        'outline':         '#6e7a71',
        'outline-variant': '#e7e2d9',

        // ── Background ────────────────────────────────────────────────────────
        'background':    '#faf9f7',
        'on-background': '#1b1c1b',

        // ── Error ─────────────────────────────────────────────────────────────
        'error':           '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error':        '#ffffff',
      },

      // ── Shadows ──────────────────────────────────────────────────────────────
      boxShadow: {
        'ambient':    '0 0 24px rgba(27,28,27,0.04)',
        'ambient-lg': '0 12px 40px rgba(27,28,27,0.04)',
      },

      // ── Typography ────────────────────────────────────────────────────────────
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
