// Accent themes selectable from the header. The actual color values live in
// src/index.css under matching [data-theme] selectors; this file only carries
// the metadata the switcher needs (id, label, and a swatch for the chip).

export type AccentTheme = 'indigo' | 'teal' | 'slate' | 'terracotta'

export const DEFAULT_ACCENT_THEME: AccentTheme = 'indigo'

export interface ThemeMeta {
  id: AccentTheme
  label: string
  /** representative swatch (mirrors --accent-500), for the switcher chips */
  swatch: string
}

export const ACCENT_THEMES: ThemeMeta[] = [
  { id: 'indigo', label: 'Indigo', swatch: '#6470d6' },
  { id: 'teal', label: 'Teal', swatch: '#3aa89d' },
  { id: 'slate', label: 'Slate', swatch: '#5e7290' },
  { id: 'terracotta', label: 'Terracotta', swatch: '#c4714f' },
]

const VALID = new Set<string>(ACCENT_THEMES.map((t) => t.id))

/** Apply a theme by setting the data attribute the CSS palettes key off of. */
export function applyAccentTheme(theme: AccentTheme): void {
  document.documentElement.dataset.theme = theme
}

/**
 * Read the persisted theme straight from localStorage and apply it before React
 * mounts, so there's no flash of the default palette on load. Safe to call before
 * the store hydrates; falls back to the default on any error.
 */
export function bootstrapAccentTheme(): void {
  let theme: AccentTheme = DEFAULT_ACCENT_THEME
  try {
    const raw = localStorage.getItem('digest-store')
    const persisted = raw ? (JSON.parse(raw)?.state?.settings?.accentTheme as string) : null
    if (persisted && VALID.has(persisted)) theme = persisted as AccentTheme
  } catch {
    /* unparseable / unavailable storage — use the default */
  }
  applyAccentTheme(theme)
}
