# Theme system: what changed and how to disable a theme

This project now supports a custom app-level theme selector that is separate from Mantine's built-in light/dark scheme.

The main idea is:

- `src/theme.ts` defines the available app themes and their token values.
- `src/App.tsx` stores the active theme in app state and localStorage.
- `ThemeCssVars()` writes the selected theme tokens to `document.documentElement` as CSS variables.
- The header reads the active app theme and renders the selector buttons.

## Files involved

- `src/theme.ts` — central source of truth for app themes
- `src/App.tsx` — app theme state, persistence, and CSS variable injection
- `src/studio/components/StudioHeader.tsx` — UI selector
- `src/global.css` — base CSS variables and shell styling

## What was added

### 1) App theme options

In `src/theme.ts`, we added an array called `appThemeOptions`:

```ts
export const appThemeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'midnight', label: 'Midnight' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'forest', label: 'Forest' },
  { value: 'aurora', label: 'Aurora' },
] as const;
```

This is the list the selector shows in the header.

### 2) Theme tokens for every mode

We replaced one light/dark pair with a full `themeTokens` map:

```ts
export const themeTokens: Record<AppThemeName, {...}> = {
  light: { ... },
  dark: { ... },
  midnight: { ... },
  sunset: { ... },
  forest: { ... },
  aurora: { ... },
};
```

Each theme defines the actual CSS variables used by the app:

- `bg-canvas`
- `surface-1`
- `surface-2`
- `surface-3`
- `line`
- `line-strong`
- `text-primary`
- `text-secondary`
- `text-muted`
- `accent`
- `accent-b`
- `accent-dim`
- `danger`
- `header-bg`

These are exported to CSS variables like:

```ts
--ez-bg-canvas
--ez-surface-2
--ez-accent
--ez-accent-b
--ez-accent-dim
```

### 3) CSS variable injection at runtime

`src/App.tsx` uses a hook called `ThemeCssVars()`:

```tsx
useEffect(() => {
  const vars = getThemeVars(activeTheme);
  const root = document.documentElement;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}, [activeTheme]);
```

This means the selected theme updates the actual app shell immediately by writing to the root element.

### 4) Mantine brand palette update

The app also generates a matching brand palette for Mantine components:

```ts
const brandPalettes: Record<AppThemeName, [...]> = {
  light: [...],
  dark: [...],
  midnight: [...],
  sunset: [...],
  forest: [...],
  aurora: [...],
};
```

Then:

```ts
export const buildMantineTheme = (mode: AppThemeName) =>
  createTheme({
    primaryColor: 'brand',
    colors: { brand: getBrandPalette(mode) },
    ...
  });
```

This ensures buttons, badges, filled states, and glow effects follow the active theme instead of staying stuck on one purple palette.

### 5) Theme persistence

The selected app theme is saved in localStorage:

```ts
window.localStorage.setItem('ezclip-app-theme', appTheme);
```

It is restored on startup with `getStoredTheme()`.

### 6) Header selector

The header in `src/studio/components/StudioHeader.tsx` reads from `useAppTheme()` and renders a small compact set of theme buttons.

This is why the user can switch themes without changing the app architecture.

## How the theme flow works

The flow is:

1. User clicks a theme button in the header.
2. `setTheme(nextTheme)` updates the app context state.
3. `ThemeCssVars()` runs and writes all `--ez-*` variables to `:root`.
4. `buildMantineTheme(appTheme)` rebuilds the Mantine palette so brand-based components match the selected theme.
5. LocalStorage persists the active theme so it survives reloads.

## If you want to disable a theme

There are only three places to remove it.

### A) Remove it from the selector list

Edit `appThemeOptions` in `src/theme.ts`:

```ts
export const appThemeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  // remove 'sunset' if you do not want it shown
] as const;
```

### B) Remove its color token set

Delete the matching entry from `themeTokens`:

```ts
sunset: {
  ...
},
```

### C) Remove its Mantine brand palette entry

Delete the matching entry from `brandPalettes`:

```ts
sunset: [...],
```

If you skip this step, the selector may hide the theme but the theme still exists internally and the theme generator may still know about it.

### D) Optional: clear stored data

If the disabled theme was previously selected, remove the old localStorage value from the browser:

```js
localStorage.removeItem('ezclip-app-theme');
```

Then reload the app.

## Recommended safe pattern

If a theme is not meant to be user-facing anymore but you still want to keep it for future work, do this instead of deleting it outright:

```ts
export const appThemeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'midnight', label: 'Midnight', hidden: true },
] as const;
```

Then filter it in the selector render code:

```tsx
{appThemeOptions
  .filter((option) => !('hidden' in option && option.hidden))
  .map(...)}
```

This is useful when you want to keep the theme definition but stop showing it to users.

## One important constraint

The app uses a custom app theme system, but Mantine’s color scheme still maps to only `light` and `dark` internally. That is why `ThemeCssVars()` intentionally converts the selected app theme into Mantine's `light`/`dark` scheme when needed:

```ts
const nextMantineScheme = activeTheme === 'light' ? 'light' : 'dark';
```

This keeps the custom theme palette and the Mantine internals in sync without breaking the app.

## Summary

The theme system is now centralized and intentionally easy to manage:

- add a theme in one place
- add its tokens in the same file
- add its brand palette in the same file
- it appears in the header automatically
- remove it by deleting the option and its two token maps

That is the exact control point for future theme edits.
