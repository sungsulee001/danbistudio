import type { Config } from 'tailwindcss'

/**
 * Broadsheet tokens surfaced as Tailwind utilities.
 *
 * Every value resolves through a CSS variable defined in `src/app/globals.css`,
 * so `data-theme="light"` on <html> reskins the whole app without a class sweep.
 * Colors are stored there as space-separated RGB triplets, which is what lets
 * the alpha modifier work — `bg-accent/10`, `border-accent-500/40`.
 *
 * Use these, not the stock Tailwind palette: the zinc/emerald/sky/amber/rose
 * scales are off-system and were swept out of the editor.
 */
const ramp = (name: string) => ({
  DEFAULT: `rgb(var(--ds-${name}-rgb) / <alpha-value>)`,
  100: `rgb(var(--ds-${name}-100-rgb) / <alpha-value>)`,
  200: `rgb(var(--ds-${name}-200-rgb) / <alpha-value>)`,
  300: `rgb(var(--ds-${name}-300-rgb) / <alpha-value>)`,
  400: `rgb(var(--ds-${name}-400-rgb) / <alpha-value>)`,
  500: `rgb(var(--ds-${name}-500-rgb) / <alpha-value>)`,
  600: `rgb(var(--ds-${name}-600-rgb) / <alpha-value>)`,
  700: `rgb(var(--ds-${name}-700-rgb) / <alpha-value>)`,
  800: `rgb(var(--ds-${name}-800-rgb) / <alpha-value>)`,
  900: `rgb(var(--ds-${name}-900-rgb) / <alpha-value>)`,
})

/** The 1.25x whitespace scale, keyed to Tailwind's numbered steps. */
const DENSITY = {
  0.5: '2.5px',
  1: 'var(--ds-space-1)',
  1.5: '7.5px',
  2: 'var(--ds-space-2)',
  2.5: '12.5px',
  3: 'var(--ds-space-3)',
  3.5: '17.5px',
  4: 'var(--ds-space-4)',
  5: '25px',
  6: 'var(--ds-space-6)',
  8: 'var(--ds-space-8)',
  'ds-1': 'var(--ds-space-1)',
  'ds-2': 'var(--ds-space-2)',
  'ds-3': 'var(--ds-space-3)',
  'ds-4': 'var(--ds-space-4)',
  'ds-6': 'var(--ds-space-6)',
  'ds-8': 'var(--ds-space-8)',
}

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/electron/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    /* Declared in full, not extended, because order decides cascade order and
       `ed` has to land between `lg` and `xl`. `ed` is the editor's desktop
       step: waiting for `xl` (1280) collapsed the workspace into a single
       6,000px-tall column on every laptop below it. 1152 rather than 1024 —
       the four columns hold at 1024 but the panels get cramped enough that
       the bin's controls wrap, so the stacked layout is the better trade
       below this. Other pages keep the stock steps. */
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      ed: '1152px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        /* Ground and ink */
        paper: 'rgb(var(--ds-bg-rgb) / <alpha-value>)',
        surface: 'rgb(var(--ds-surface-rgb) / <alpha-value>)',
        ink: 'rgb(var(--ds-text-rgb) / <alpha-value>)',

        /* The monitors — the darkest faces on screen, in both themes */
        monitor: {
          DEFAULT: 'rgb(var(--ds-monitor-rgb) / <alpha-value>)',
          source: 'rgb(var(--ds-monitor-source-rgb) / <alpha-value>)',
        },

        /* Ink for text sitting on a fixed bright fill (timeline clips), where
           a theme-following color would invert and disappear. */
        onbright: 'rgb(var(--ds-on-bright-rgb) / <alpha-value>)',

        /* Ramps. `ds` is the neutral one; step 100 is the faintest tint
           against the ground and 900 the strongest ink, in both themes. */
        ds: ramp('neutral'),
        accent: ramp('accent'),
        accent2: ramp('accent2'),
        info: ramp('info'),
        warn: ramp('warn'),
        danger: ramp('danger'),

        /* Pre-existing aliases, retuned to Broadsheet in globals.css */
        primary: 'rgb(var(--primary-rgb) / <alpha-value>)',
        secondary: 'rgb(var(--secondary-rgb) / <alpha-value>)',
        border: 'rgb(var(--border-rgb) / <alpha-value>)',
        background: 'rgb(var(--background-start-rgb) / <alpha-value>)',
        foreground: 'rgb(var(--foreground-rgb) / <alpha-value>)',
      },
      fontFamily: {
        heading: 'var(--ds-font-heading)',
        body: 'var(--ds-font-body)',
      },
      fontSize: {
        /* Broadsheet's editor type scale, read off the prototype. Tailwind's
           own names are remapped onto it so existing markup lands on the
           system's steps without a 51-file sweep:
             xs   12px  chrome, toolbars, chips
             sm   13px  body — list rows, buttons, spec text (was 14)
             base 15px  the sheet's base size (was 16)
             lg   19px  panel title (was 18)
           and three steps the stock scale has no name for. */
        micro: ['10px', { lineHeight: '1.3', letterSpacing: '0.06em' }],
        meta: ['11px', { lineHeight: '1.35' }],
        xs: ['12px', { lineHeight: '1.4' }],
        sm: ['13px', { lineHeight: '1.5' }],
        ui: ['14px', { lineHeight: '1.45' }],
        base: ['15px', { lineHeight: '1.55' }],
        /* The transport timecode — the largest figure in the chrome. */
        tc: ['17px', { lineHeight: '1.2', letterSpacing: '0.02em' }],
        lg: ['19px', { lineHeight: '1.2' }],
        /* `h6` — the panel kicker: 13px, uppercase, wide. */
        kicker: ['13px', { lineHeight: '1.3', letterSpacing: '0.08em' }],
      },
      borderRadius: {
        /* Broadsheet is a near-square system: 1 / 2 / 4px. Tailwind's own
           sm-lg names are remapped so existing `rounded-md` markup lands on
           the system's 2px rather than 6px. */
        none: '0px',
        sm: 'var(--ds-radius-sm)',
        DEFAULT: 'var(--ds-radius-md)',
        md: 'var(--ds-radius-md)',
        lg: 'var(--ds-radius-lg)',
        xl: 'var(--ds-radius-lg)',
        '2xl': 'var(--ds-radius-lg)',
        '3xl': 'var(--ds-radius-lg)',
        full: '9999px',
      },
      boxShadow: {
        sm: 'var(--ds-shadow-sm)',
        DEFAULT: 'var(--ds-shadow-sm)',
        md: 'var(--ds-shadow-md)',
        lg: 'var(--ds-shadow-lg)',
        xl: 'var(--ds-shadow-lg)',
      },
      spacing: {
        /* Named steps, for the places that want the scale explicitly. The
           numbered steps are deliberately NOT retuned here — `spacing` also
           feeds width, height and inset, and resizing those would move
           handles, icon boxes and absolutely-positioned overlays. */
        'ds-1': 'var(--ds-space-1)',
        'ds-2': 'var(--ds-space-2)',
        'ds-3': 'var(--ds-space-3)',
        'ds-4': 'var(--ds-space-4)',
        'ds-6': 'var(--ds-space-6)',
        'ds-8': 'var(--ds-space-8)',
      },
      /* Density 1.25x, applied to whitespace only. Broadsheet bakes the
         density into its --space-* scale, so rather than rewrite 51 files of
         `p-2`/`gap-3`, the numbered steps are retuned where they mean
         whitespace: 1→5, 2→10, 3→15, 4→20, 6→30, 8→40. Existing markup lands
         on the prototype's rhythm unchanged, and element dimensions are
         untouched. */
      padding: DENSITY,
      margin: DENSITY,
      gap: DENSITY,
      space: DENSITY,
      scrollPadding: DENSITY,
      outlineColor: {
        accent: 'rgb(var(--ds-accent-rgb) / <alpha-value>)',
      },
    },
  },
  plugins: [],
}
export default config
