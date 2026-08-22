import { createTheme, rem } from '@mantine/core';

/**
 * Design tokens — the single source of truth for the product's visual language.
 *
 * Dark (default editing canvas) + Light (same product, not an inverted dark mode).
 * Every token flips together via Mantine's color scheme; components should consume
 * the `--ez-*` CSS variables (or `light-dark(...)` / `var(--mantine-color-brand-*)`)
 * rather than hardcoding raw hex.
 *
 * Brand accent: #7C6CF6 (dark) → #9F86FA (bright) | #6552E8 (light) → #5642D6 (deep)
 */

/** Monospace face for timecodes, durations, frame counts, IDs — makes this read as a tool. */
export const monoFont =
  '"JetBrains Mono", "SFMono-Regular", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace';

/** UI face — Inter with a system stack fallback. */
export const uiFont =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// The one brand color, expressed as a Mantine palette so every component variant
// (filled/light/outline/subtle) is derived from it automatically.
const BRAND: [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
] = [
  '#F1EFFE',
  '#E4DEFC',
  '#D0C7FA',
  '#B7A9F7',
  '#9F8BF3',
  '#7C6CF6', // --accent (dark)
  '#6A57EE',
  '#5A46D8',
  '#4C3ABA',
  '#3E2F99',
];

export const theme = createTheme({
  primaryColor: 'brand',
  colors: { brand: BRAND },
  fontFamily: uiFont,
  // Mono face for anything numeric-technical (timecodes etc.).
  fontFamilyMonospace: monoFont,
  // Typography scale tuned to the design language: 11 → 29px equivalents.
  fontSizes: {
    xs: rem(11),
    sm: rem(12.5),
    md: rem(13.5),
    lg: rem(15),
    xl: rem(20),
  },
  headings: {
    fontWeight: '700',
    sizes: {
      h1: { fontSize: rem(29) },
      h2: { fontSize: rem(24) },
      h3: { fontSize: rem(20) },
      h4: { fontSize: rem(15) },
    },
  },
  // Radius scale: 9px controls, 14px cards, 20px containers/frames.
  radius: {
    xs: rem(6),
    sm: rem(9),
    md: rem(9),
    lg: rem(14),
    xl: rem(20),
  },
  // Functional shadows only: on the primary CTA (brand glow) + floating/popover.
  shadows: {
    xs: '0 1px 3px rgba(0,0,0,0.18)',
    sm: '0 2px 8px rgba(0,0,0,0.22)',
    md: '0 8px 28px rgba(0,0,0,0.30)',
    lg: '0 16px 48px rgba(0,0,0,0.36)',
    xl: '0 24px 64px rgba(0,0,0,0.42)',
    // Brand glow — reserved for the primary CTA.
    brand: '0 0 0 1px rgba(124,108,246,0.35), 0 8px 24px rgba(124,108,246,0.40)',
  },
  // Default to a pointer cursor on interactive controls (feels native).
  cursorType: 'pointer',
  respectReducedMotion: true,
  defaultRadius: 'md',
});
