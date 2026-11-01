# Design

The visual system behind Studio Tracker. Everything below is implemented in
`app/globals.css` as semantic custom properties; components never name a raw
colour, so both themes come from one set of classes.

## Theme

**Quiet tool.** A studio tracker is opened forty times a day by people who are
in the middle of something else. The interface holds still: neutral surfaces,
thin lines, one accent, and colour reserved for meaning (status, priority,
budget pressure, the current selection).

Light and dark are both first class. The choice is stored per person
(`localStorage`, key `studio-theme`) and follows the operating system until
somebody picks a side. A script in `<head>` applies it before the first paint
and `ThemeSync` re-applies it after hydration, so no route flashes white.

Dark mode is a dim room, not a terminal: blue-grey charcoal, never pure black,
never neon.

## Colour

OKLCH throughout. Neutrals carry 0.003 to 0.018 chroma toward the accent's hue,
so greys look related to the brand rather than dead.

| Role | Light | Dark | Used for |
|---|---|---|---|
| `--color-canvas` | `oklch(0.977 0.004 235)` | `oklch(0.205 0.012 255)` | page backdrop |
| `--color-surface` | white | `oklch(0.243 0.012 255)` | cards, fields, menus |
| `--color-surface-2` | `oklch(0.988 0.003 235)` | `oklch(0.224 0.012 255)` | sidebar, table heads |
| `--color-surface-3` | `oklch(0.955 0.006 235)` | `oklch(0.278 0.012 255)` | wells, chips, code |
| `--color-hover` / `-strong` | +/- one step | +/- one step | row and button hover |
| `--color-line` / `-strong` | `oklch(0.915 …)` / `oklch(0.855 …)` | `oklch(0.318 …)` / `oklch(0.405 …)` | borders, dividers |
| `--color-ink` | `oklch(0.245 0.018 255)` | `oklch(0.955 0.004 255)` | primary text |
| `--color-ink-2` | `oklch(0.440 …)` | `oklch(0.830 …)` | secondary text |
| `--color-muted` | `oklch(0.545 …)` | `oklch(0.705 …)` | captions, placeholders |
| `--color-faint` | `oklch(0.680 …)` | `oklch(0.560 …)` | icons, disabled |
| `--color-brand` | `oklch(0.500 0.085 220)` | `oklch(0.725 0.100 220)` | primary action, selection, focus, links |
| `--color-ok` / `-soft` / `-line` | green 155 | lifted green 155 | done, within budget |
| `--color-warn` / `-soft` / `-line` | amber 78 | lifted amber 80 | approaching a limit |
| `--color-danger` / `-soft` / `-line` | red 22 | lifted red 22 | destructive, over budget, overdue |

**Strategy: restrained.** One accent, a deep petrol blue, deliberately not the
indigo/violet every tracker ships with and far enough from the "in progress"
blue used by workflow statuses that the two never read as the same thing. It
appears on primary buttons, the active navigation item's icon, links, focus
rings and the current selection. Nothing is coloured for decoration.

Every text/background pair is measured, not eyeballed: body copy clears 4.5:1
and large text 3:1 in both themes, checked in the browser across the app.

**Database-driven colour.** Workflow statuses, teams and people carry a hex
chosen by a user. Those are never used as raw text colour; the `.tint` class
mixes the hue into the current surface and ink so a pill stays legible on both
themes, and `.avatar` pushes the hue to a lightness where the initials on top
of it clear 4.5:1.

## Typography

One family: **Inter**, self-hosted through `next/font`, in weights 400 to 700.
A tool does not need a display face, and a second family would only compete
with the data.

| Step | Size | Weight | Where |
|---|---|---|---|
| Page title | 21px | 600 | `PageHeader` |
| Card title | 14px | 600 | `CardHeader` |
| Body | 13.5px | 400 | rows, forms, prose |
| Data | 13px | 400/500 | tables |
| Caption | 12 to 12.5px | 400 | secondary lines |
| Column head | 11.5px | 600, uppercase, 0.04em | table headers only |
| Stat | 26px | 600 | `Stat` |

Numbers use `font-variant-numeric: tabular-nums` (`.num`, and every table cell)
so hours, money and dates line up column to column. Headings sit at
`-0.011em` tracking and `text-wrap: balance`; nothing is set in all caps except
the table column heads.

## Icon and avatar scale

Icons come from lucide at four sizes and nothing else: **13** inline next to
text, **15** in buttons and fields, **16** in navigation, **28–30** in empty
states. Avatars use **20** inline in a meta line, **24** in dense table rows,
**28** in list rows, **32** on a detail header.

## Components

- **Button** — four variants (primary, secondary, ghost, danger), two sizes,
  each with hover, active, focus-visible and disabled. 8px radius.
- **Field** — one input treatment for text, select and textarea: 1px border,
  hover darkens the border, focus swaps to the accent plus a 3px ring, disabled
  drops to `surface-3`, `aria-invalid` turns the border red. Autofill is
  repainted so Chrome's pale blue never lands on the dark theme.
- **Card** — surface, 1px line, 10px radius, no shadow. Shadows are reserved
  for things that float (`--shadow-pop` on menus, the palette, lightboxes).
  Cards are never nested.
- **Badge** — neutral by default, `.tint` when a hex comes from the database.
- **Table** — `surface-2` head with uppercase labels, 1px row lines, no zebra.
- **Empty states** — a sentence that says what to do next, not "no data".
- **404 and error** — designed pages that name the likely cause and offer the
  way out, in the current theme.

## Layout

- App shell: 240px sidebar on `surface-2`, content on canvas, single content
  column with `max-w` per page. Below `lg` the sidebar becomes a scrollable
  row of the same items.
- Portal: centred 5xl column, its own header, no sidebar.
- Phones: the sidebar becomes a scrollable row of the same items, and below
  `md` the projects and tickets tables are replaced by row lists carrying the
  same data, so nothing has to be dragged sideways. The wide tables that remain
  (people, clients, reports, the timesheet grid) scroll inside their own
  container and never push the page.
- Auth screens (`/login`, `/set-password`, `/intake`) share `AuthFrame`:
  wordmark, theme toggle, one card, footer note.
- Radii: 8px fields and buttons, 10px cards, full only on pills and avatars.
- Z-index is a named scale (`--z-sticky` through `--z-toast`), never an
  arbitrary 9999.

## Loading

Every list route has a `loading.tsx` that renders the shape of the page it is
waiting for: the same header, the same number of stat cards, rows of the same
height. Sixteen routes in total, from the dashboard to the client portal. The
placeholder is `--color-surface-3` with a slow opacity pulse between 1 and 0.55,
never a shimmer sweeping across the screen, and it inherits the reduced-motion
rule like everything else. They are server components, so they add nothing to
the client bundle.

## Destructive actions

Nothing irreversible happens on one click, and no browser dialog is ever used.
`ConfirmSubmit` turns the button into "question, Delete, Cancel" in place;
`ConfirmIconSubmit` does the same for the small icon buttons that remove one
row. Both disarm themselves after six seconds and show their own pending label
while the server action runs. Submits that take a moment (send an approval, add
a crew member, add a status) use `SubmitButton`, which disables itself and says
what it is doing.

## Overlays

The command palette, the modal and the file lightbox are real dialogs:
`role="dialog" aria-modal="true"`, Escape closes them, the body stops scrolling
behind them, and `useFocusTrap` keeps Tab inside and hands focus back to
whatever opened them. Tab on the last control wraps to the first, Shift+Tab on
the first wraps to the last, and focus that lands outside is pulled back on the
next Tab.

## Motion

Transitions are 110ms (`--dur-fast`) for hover and focus, 170ms
(`--dur`) for anything larger, on `cubic-bezier(0.25, 1, 0.5, 1)`. Motion
reports a state change and nothing else: no page-load choreography, no
scroll-triggered reveals. `prefers-reduced-motion: reduce` collapses every
transition to nothing.

## First run

A studio with no projects at all gets a four-step setup card on the dashboard
instead of four zeroes: describe a workflow, add the people, add a client,
create the project. Each step ticks itself off as it is done, and the card
carries the public intake link. It is shown only to admins and managers, so a
developer with nothing assigned yet is never told to "add the first client",
and it disappears for good once the first project exists.

## Print

Reports print as a hand-off sheet. The dark theme's variables are overridden
back to ink-on-white; navigation, filters and buttons are hidden; table headers
repeat across pages and rows never split. A `.print-only` letterhead appears
that the screen never shows: what the document is, the period, the client and
project filter, and the date it was generated, because the sheet leaves the
studio next to an invoice. Dates never wrap.
