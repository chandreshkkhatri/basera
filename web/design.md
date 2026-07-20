# Design — Basera

A locked design system for this app, produced by `hallmark redesign` (multi-page
flow). Every page redesign reads this file before emitting code. Do not
regenerate per page — extend or amend this file when the system needs to grow.

Codename: **Dusk**. The feeling is an Indian city at twilight — inky indigo
night, electric-violet streetlight, one warm marigold glow. Dark is the hero
theme; light is a faithful daytime translation.

## Genre

modern-minimal, with an editorial-utilitarian edge. Basera is a dense data
product (aggregated rental listings), not a marketing site. Function carries
every page; ornament is rationed.

## Macrostructure family

- App pages (feed `/`, saved `/saved`, map `/map`): **Workbench** — a compact
  toolbar of controls above a dense result surface (table / card grid / stacked
  rows). Variation knob: result surface only.
- Content pages (listing detail `/listings/[id]`): **Split-Studio** — a media
  banner over a two-column info body (facts + actions). Variation knob: hero
  banner treatment.
- Chrome (header, bottom-nav): shared across every page, never varies.

## Theme

Single vivid accent (violet) + one rationed warm highlight (marigold, rent &
live-state only, ≤ 5 % of any viewport). Neutrals carry a faint violet tint so
the brand reads through even in greys.

Dark (hero):
- `--background`  oklch(0.155 0.017 285)   inky indigo night
- `--card`        oklch(0.205 0.018 286)   raised surface
- `--foreground`  oklch(0.97 0.006 286)
- `--muted-foreground` oklch(0.72 0.02 286)
- `--rule/--border` oklch(1 0 0 / 12%)     hairline
- `--primary` (violet)   oklch(0.67 0.23 292)
- `--highlight` (marigold) oklch(0.82 0.14 74)
- `--focus/--ring`       oklch(0.67 0.23 292)

Light (day):
- `--background`  oklch(0.99 0.004 286)
- `--card`        oklch(1 0 0)
- `--foreground`  oklch(0.17 0.02 286)
- `--primary` (violet)   oklch(0.55 0.25 293)
- `--highlight` (marigold) oklch(0.66 0.15 66)

Full token values live in `src/app/globals.css` (`:root` + `.dark`). Pages
reference tokens by name (`bg-brand`, `text-highlight`, `border-border`) — never
inline OKLCH.

## Typography

- Display: Space Grotesk, weight 700, style normal. Tracking −0.02em on headings
  and rent figures.
- Body: Inter, weight 400/500.
- Mono: SF Mono / Consolas fallback stack (IDs, coordinates).
- Money is always `tabular-nums` — figures must not jitter down a list.
- No italic headers (Hallmark gate 38a).

## Spacing

Tailwind's 4-pt scale (`gap-2`, `p-4`, …). Card interior padding `p-4`; page
gutters `px-4`. Named tokens only; no magic numbers.

## Motion

- Motion-cut project (no motion library). Transitions are CSS only:
  `transition-colors` / `transition-transform`, duration ~150–200 ms.
- Signature move: card **hover-lift** (`-translate-y-0.5`) + border→brand.
- Reduced-motion: `@media (prefers-reduced-motion: reduce)` disables transforms.
- Never animate the focus ring; it shows instantly at ≥ 3:1 contrast.

## Microinteractions stance

- Silent success over celebratory toasts (save = fill the heart, no popup).
- Optimistic local state; no confirmation dialogs for reversible actions.
- Focus-visible ring always present; hover is an enhancement, not a requirement.

## CTA voice

- Primary CTA: solid `bg-brand` fill, `rounded-lg`, medium weight, verb-led copy
  ("Contact poster", "Save point").
- Secondary CTA: `outline` variant, same radius.
- Icon-only actions carry an `aria-label`.

## Signature details

- **Card**: hairline border, `rounded-xl`, a 2px brand left-edge that saturates
  on hover, plus the hover-lift. Rent is the loudest element (display, tabular).
- **Wordmark**: filled violet tile "b" + Space Grotesk "Basera", tracking-tight.
- **Active nav**: a short brand underline / pill, never a full-width block.

## Per-page allowances

- App pages MUST NOT use enrichment — the listings are the content.
- Detail page MAY use a media banner (existing source-glyph art), no invented
  photography.

## What pages MUST share

- The wordmark, the violet accent + its ≤5% placement, the marigold highlight
  reserved for rent/live-state, the Grotesk+Inter pairing, the CTA voice, the
  card voice (border + left-edge + hover-lift), tabular money.

## What pages MAY differ on

- The result surface (table vs cards vs stacked rows) within the Workbench
  family; the detail banner treatment within Split-Studio.
