---
applyTo: "**/*.{js,jsx,ts,tsx,css}"
---

# Frontend / UI Development

Mantine is the primary UI library for this project.

## Documentation Workflow (mandatory)

For **every** UI task, index first, then verify, then implement — don't guess:

1. Read **`llms.txt`** first → tells you *what* Mantine component/hook/pattern is appropriate.
2. Search **`llms-full.txt`** for that specific component → authoritative source of truth for the *how* (API, props, examples).
3. Read only the relevant section — never load the whole `llms-full.txt`.
4. Implement with the documented Mantine API. Prefer existing Mantine components over custom UI.

**Source rules:**
- `llms-full.txt` is the local source of truth — do **not** fetch Mantine docs from the web when it's available locally.
- **Do not guess** component names, props, APIs, hooks, or styling patterns — verify in `llms-full.txt` first.

## Component approach

- Build all UI with **Mantine components + Mantine Pro styling patterns**.
- **No other UI library** — only custom UI when Mantine genuinely can't cover it, or the product needs custom behavior/presentation.
- Keep **custom CSS to a minimum**.
- **Reuse existing project components** whenever possible.

## Mobile & Web Responsive Design

Components should work on both **mobile and web**, not just inherit default responsiveness — design deliberately for mobile users:

- **Mobile-first layout:** design for small screens first, then scale up to desktop. Use Mantine responsive props (`xs`/`sm`/`md`/`lg` breakpoints, `Grid`, `Stack`, `SimpleGrid`, `hiddenFrom`/`visibleFrom`).
- **Touch-friendly:** target ≥44px tap targets, adequate spacing/padding, no tiny taps.
- **Single-column stacking on mobile** for forms, cards, and grids; avoid cramped multi-column layouts.
- **Readable type:** relax density on mobile; keep font sizes legible without zoom.
- **Navigation:** on mobile, keep primary actions within thumb reach; consider bottom nav / drawer / collapsible menus.
- **Test both viewports:** before finishing, confirm the layout is clean and usable at mobile AND desktop widths — don't ship something that only works on desktop.
- Respect safe areas / notches and avoid horizontal overflow on narrow screens.

## UI Quality

Aim beyond "functional": polished, consistent, responsive, **accessible** interfaces. Mantine provides reliable primitives; add custom styling for a modern, distinctive look.

## Final Check

Before marking UI work complete:

- `llms.txt` consulted, then the relevant Mantine API verified in `llms-full.txt`.
- Existing Mantine/project components reused; no new UI library introduced.
- Layout is clean at **both mobile and desktop** widths and is touch-friendly.
- Loading, empty, error, and disabled states are handled where relevant.
- Interface is responsive and accessible.