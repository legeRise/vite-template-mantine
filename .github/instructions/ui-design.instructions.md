---
applyTo: "**/*.{js,jsx,ts,tsx,css}"
---

# UI Design — Visual Language

Complements `frontend.instructions.md`. That file governs *how* to build (Mantine, docs workflow, responsiveness). This file governs *how it should look and feel*: a premium, native, editing-tool aesthetic — think Descript/Arc/Linear, not a generic admin dashboard.

## Design tokens

Define these as Mantine theme overrides / CSS variables — never hardcode raw hex in components.

**Color**
- `--bg-canvas: #0A0A0F` — app background
- `--surface-1: #131319`, `--surface-2: #1B1B24`, `--surface-3: #24242F` — nested elevation, darkest to lightest
- `--line: rgba(255,255,255,.08)`, `--line-strong: rgba(255,255,255,.16)` — hairline borders, never solid gray
- `--text-primary: #F4F3FA`, `--text-secondary: #9C9BAE`, `--text-muted: #68677A`
- `--accent: #7C6CF6` → `--accent-b: #9F86FA` (gradient pair) — the one brand color. Reserve it for primary actions, selection states, and AI-generated content markers. Never use it for plain structural chrome.
- `--accent-dim: rgba(124,108,246,.16)` — tint for badges, focus rings, selected-card glow
- `--danger: #F08585` — destructive actions only

**Type**
- UI face: Inter (or system stack fallback). Weights: 400 body, 600 labels/buttons, 700 headings only.
- Mono face (JetBrains Mono or similar) for anything numeric-technical: timecodes, durations, frame counts, IDs. This is what makes an editing tool read as a tool, not a form.
- Scale: 11px caption/meta → 12.5px body-small → 13.5px body → 15px section title → 20–29px page heading. Don't invent sizes outside this scale.

**Elevation & radius**
- 3-step elevation only: canvas → surface-1 (cards) → surface-2/3 (nested panels, popovers). Never more than 2 floating layers at once (e.g. a popover inside a modal is the ceiling).
- Radius: 9px controls, 14px cards, 20px containers/frames. Consistent across the app — don't mix radius scales.
- Shadows are functional, not decorative: only on the primary CTA (brand glow) and floating/popover elements. Flat surfaces elsewhere.

## Theming — dark and light

Ship both from day one, driven by a single `data-theme` attribute (or Mantine's color scheme) so every token flips together — never hardcode a color that only works in one mode.

**Dark (default — the editing canvas)**
- `--bg: #0A0A0F` · `--surface-1: #131319` · `--surface-2: #1B1B24` · `--surface-3: #24242F`
- `--line: rgba(255,255,255,.08)` · `--line-strong: rgba(255,255,255,.16)`
- `--text-primary: #F4F3FA` · `--text-secondary: #9C9BAE` · `--text-muted: #68677A`
- `--accent: #7C6CF6` → `--accent-b: #9F86FA` · `--accent-dim: rgba(124,108,246,.16)`
- `--danger: #F08585`

**Light (same product, not an inverted dark mode)**
- `--bg: #FAF9FC` · `--surface-1: #FFFFFF` · `--surface-2: #F5F3FA` · `--surface-3: #ECE9F5`
- `--line: rgba(23,17,45,.09)` · `--line-strong: rgba(23,17,45,.16)`
- `--text-primary: #171325` · `--text-secondary: #615D74` · `--text-muted: #918DA3`
- `--accent: #6552E8` → `--accent-b: #5642D6` · `--accent-dim: rgba(101,82,232,.10)` — deepened vs. dark mode since violet on white needs more saturation to hold the same visual weight it has on black
- `--danger: #C8443B`

Rules that hold across both modes:
- Never derive light mode by simply inverting dark values — recompute contrast and saturation per surface (this is why the light accent is a different hex, not `#7C6CF6` at lower opacity).
- Borders are always tinted from the text color at low alpha (`rgba(23,17,45,.09)` in light, `rgba(255,255,255,.08)` in dark), never a flat neutral gray — this is what keeps hairlines feeling native to the palette instead of generic.
- Placeholder/thumbnail gradients swap direction and stops too: dark mode uses a deep violet-to-near-black gradient; light mode uses a pale lavender-to-lilac gradient (`#E7E3F7 → #DBD5F2`) — same shape, inverted weight, so empty states never look like a bug in either mode.
- Default to the user's system preference (`prefers-color-scheme`) on first load; persist an explicit override if they toggle manually.

## Signature pattern: the timeline

The scene timeline is this product's one ownable visual element — treat it as the signature, not just another list:
- Selected clip gets a persistent accent border + soft `--accent-dim` glow ring, not just a color swap.
- Playhead is a bright white line with a small circular handle — always higher-contrast than any other element on screen.
- Use the mono font for all timecodes inside the timeline and scene cards.
- Keep everything else around the timeline quiet (surface-1, muted borders) so it stays the visual anchor.

## Motion

- Panel/tab switches: 150–200ms ease, opacity + 4px translate — no bouncy easing.
- Hover states on cards/buttons: background step (surface-1 → surface-2), never scale or shadow pop.
- Reserve any glow/pulse animation for actively-generating AI states (e.g. "regenerating scene") — motion should communicate system status, not decorate idle UI.
- Respect `prefers-reduced-motion`.

## Component rules

- **One primary button per view.** Everything else is ghost or subtle (`--accent-dim` background, accent text) — this is what keeps the purple meaningful instead of turning into wallpaper.
- **AI actions get their own subtle style**: `--accent-dim` background + accent-b text (e.g. "✨ Change with AI"), distinct from a plain secondary button, so generated/AI-touched content is always visually traceable.
- **Destructive actions** are ghost buttons with `--danger` text/border only — never filled red, never placed next to the primary action without a divider or spacing gap.
- **Badges/pills** (e.g. "Draft", "Image model", "Generated"): `--accent-dim` bg, `--accent-b` text, uppercase, 10.5px, letter-spacing .04em — one consistent pattern reused everywhere, don't invent new badge styles per screen.
- **Cards representing generated/media content** (scene thumbnails, video preview) always use a dark gradient placeholder (`135deg, surface-2 → surface-1`) rather than flat gray, so empty/loading states still feel premium.

## Mobile adaptation (beyond frontend.instructions.md's responsive rules)

- Collapse icon rails and secondary top-bar actions first; keep exactly one primary action pinned full-width at the bottom or top.
- Timeline stays horizontally scrollable at full detail on mobile — never shrink timecodes or hide the playhead to save space.
- Multi-column workspaces (scenes / preview / inspector) stack in this priority order on narrow screens: preview → scenes → inspector, since seeing the result matters more than editing controls on first glance.

## Final check

- Only one accent-filled element competing for attention per screen.
- Every border uses `--line`/`--line-strong`, never a flat gray hex.
- Timecodes and technical values are in the mono face.
- Selected/active states use the glow-ring pattern, not just a border-color swap.
