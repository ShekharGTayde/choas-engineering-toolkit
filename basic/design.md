# ChaosGuard — Design System

This is the design reference for anyone (human or AI agent) building the
ChaosGuard frontend. Read this before writing any component, page, or style.
The goal is a cohesive, opinionated visual identity — not default component-kit
styling.

---

## 1. Design Concept

ChaosGuard is a **control room for breaking things on purpose**. The product
sits somewhere between a systems-monitoring dashboard (Grafana, Datadog) and
an operator console for a controlled experiment (a lab instrument panel). The
visual language should feel like the person is at the controls of something
precise and consequential — calm and legible when everything is healthy,
unmistakably urgent when a fault is live.

The product ships with **two themes, not just a dark-mode toggle bolted onto
a light design** — each built from its own named palette, connected by one
deliberate thread (see 2.3):

- **Dark theme (default):** navy/slate — the "night ops" console, used for
  active monitoring sessions
- **Light theme:** cream/sage — a calmer, paper-like surface for reading
  past experiment reports and AI recommendations

**Avoid, explicitly:**
- The warm cream + terracotta "AI generated" look
- Generic rounded SaaS cards with identical soft grey shadows everywhere
- Tracked-out ALL-CAPS eyebrow labels above every section
- A single bright neon accent on near-black with no other color reasoning
- Treating this like a landing page — it's an operator tool, not a pitch

---

## 2. Color

### 2.1 Dark theme — "Night Ops" (Palette: navy / slate / soft blue / cream)

| Token | Hex | Usage |
|---|---|---|
| `bg-base` | `#213448` | App background |
| `bg-surface` | `#2B4054` | Panels, cards, sidebar (derived: `bg-base` lifted one step toward `slate`) |
| `bg-surface-raised` | `#33495F` | Modals, dropdowns — one step further |
| `border-subtle` | `#547792` @ 35% opacity | Hairline dividers, card borders |
| `accent-signal` | `#94B4C1` | Primary brand accent — buttons, active nav, links, focus ring |
| `text-primary` | `#EAE0CF` | Primary text — warm cream against navy, not pure white |
| `text-secondary` | `#94B4C1` @ 70% opacity | Secondary/meta text, labels |

### 2.2 Light theme — "Daylight" (Palette: cream / sage / muted green / olive)

| Token | Hex | Usage |
|---|---|---|
| `bg-base` | `#F6F0D7` | App background |
| `bg-surface` | `#FBF8EC` | Panels, cards, sidebar (derived: lifted toward white) |
| `bg-surface-raised` | `#FFFFFF` | Modals, dropdowns |
| `border-subtle` | `#C5D89D` @ 45% opacity | Hairline dividers, card borders |
| `accent-signal` | `#89986D` | Primary brand accent — buttons, active nav, links, focus ring |
| `text-primary` | `#213448` | Primary text (see 2.3 — borrowed from the dark theme's navy) |
| `text-secondary` | `#5B6653` | Secondary/meta text — a darkened olive for legibility on cream |

### 2.3 The thread connecting both themes: "Ink" and "Paper"

Rather than treating light/dark as two unrelated palettes, one color is
shared deliberately across both:

- **`#213448` (navy) is "ink"** — it's the *background* in dark theme and
  the *primary text color* in light theme.
- **Cream is "paper"** — it's the *text color* in dark theme (`#EAE0CF`) and
  the *background* in light theme (`#F6F0D7`).

This is the one intentional visual signature that says "this is still
ChaosGuard" regardless of which theme is active — a small detail, but the
kind that separates a considered dual-theme system from two palettes
switched via a toggle with no relationship to each other.

### 2.4 Status colors (functional, theme-independent)

These four convey **system state only** and never change meaning between
themes. They deliberately sit outside both named palettes — status color
must be immediately, universally readable (red = danger, amber = caution)
regardless of which theme is active, so they are not subject to the same
"stay within the palette" discipline as everything else.

| Token | Hex | Meaning |
|---|---|---|
| `status-healthy` | `#7C9A6B` | Service healthy, recovery complete — pulled from the light theme's sage/olive family, so "healthy" visually rhymes with the calmer theme |
| `status-degraded` | `#C9932F` | Latency injected, degraded but alive |
| `status-critical` | `#C0524D` | Service killed / error threshold breached / active fault — a muted brick red, chosen to sit comfortably next to both palettes rather than a jarring neon red |
| `status-recovering` | `#547792` | Fault removed, returning to baseline — pulled from the dark theme's slate blue |

**Rule:** status colors are reserved exclusively for system/service state —
never reuse `accent-signal` for a status badge, and never reuse a status
color for a generic interactive element. This separation matters most
exactly when someone is scanning quickly during an incident.

### 2.5 Usage discipline
- One accent per theme (`accent-signal`), used consistently for all interactive/brand elements
- Four status colors, theme-independent, used only on badges, chart lines, and state indicators
- No gradients as decoration. A gradient may only appear inside a chart (e.g. area-fill under a latency line) where it encodes data, never as a page background wash
- Implement themes as CSS custom properties on `:root` / `[data-theme="light"]` — never hardcode a hex value directly in a component; always reference the token

---

## 3. Typography

Two families, clearly distinct roles — chosen for the subject matter, not
defaults. Typography choices are theme-independent.

### Display / UI typeface: **Space Grotesk**
Used for headings, nav labels, buttons, card titles. A geometric sans with
slightly technical, engineered character (visible in letterforms like the
squared-off terminals) — fits the "instrument panel" concept without
tipping into a display/decorative face that would fight the data.

### Data / monospace typeface: **JetBrains Mono**
Used for **all numeric and metric values**: recovery times, latency numbers,
error rates, timestamps, target hostnames/URLs, experiment IDs. This is a
functional choice, not decoration — tabular figures in a monospace face let
numbers align in columns and let a user visually compare digits at a glance
(e.g., spotting "340ms" vs "3400ms" instantly), which a proportional face
makes harder.

### Type scale (base 16px)

| Role | Size | Weight | Family |
|---|---|---|---|
| Page title | 28px / 1.2 | 600 | Space Grotesk |
| Section heading | 20px / 1.3 | 600 | Space Grotesk |
| Card title | 15px / 1.4 | 500 | Space Grotesk |
| Body text | 14px / 1.6 | 400 | Space Grotesk |
| Secondary/meta text | 13px / 1.5 | 400 | Space Grotesk, `text-secondary` |
| Metric value (large, e.g. recovery time) | 32px / 1.1 | 500 | JetBrains Mono |
| Metric value (inline, e.g. table cell) | 14px / 1.5 | 400 | JetBrains Mono |
| Button label | 14px / 1 | 500 | Space Grotesk |

**Line length:** body/explanatory text (AI recommendation panels, tooltips)
should wrap at roughly 70–75 characters.

**Do not:**
- Use all-caps for labels (use `text-secondary` color + normal case instead)
- Bold or color a single word inside a heading for emphasis
- Add a tracked-out eyebrow label above every panel

---

## 4. Layout

**Alignment:** left-aligned throughout — this is an operator console, not a
marketing page.

**Grid:** 12-column grid, 24px gutter, 1280px max content width on large
screens, sidebar fixed at 240px.

### Primary layout concept (ASCII wireframe)

```
┌──────────┬──────────────────────────────────────────────────┐
│          │  Top bar: target name · role badge · theme toggle │
│ Sidebar  ├──────────────────────────────────────────────────┤
│          │                                                    │
│ Targets  │   Live Metrics Chart (full width, tall)           │
│ Experi-  │   — fault window shaded in status-critical/20%     │
│  ments   │                                                    │
│ History  ├───────────────────┬──────────────────────────────┤
│          │  Recovery Summary  │   AI Report Panel             │
│          │  (mono numerals)   │   (prose, 70ch max width)      │
│          ├───────────────────┴──────────────────────────────┤
│          │   Experiment History Table                        │
└──────────┴──────────────────────────────────────────────────┘
```

- The **Live Metrics Chart** is the hero of the dashboard — the first and
  largest thing in the main content area, matching the product's actual
  moment of truth
- Fault-injection windows are shown as a shaded vertical band on the chart
  using `status-critical` at low opacity, not a solid overlay
- Cards use `border-subtle` 1px borders, not shadows — shadows read as
  "generic SaaS kit"; a flat, bordered panel reads more like instrumentation
- Border radius: 6px on cards/buttons — small and functional, not the
  aggressively rounded "friendly SaaS" look, not 0px "broadsheet" either

---

## 5. Components

### Buttons
- **Primary** (e.g., "Run Experiment"): `accent-signal` background, `bg-base` text, 6px radius
- **Destructive** (e.g., "Kill Service"): `status-critical` background, requires a confirmation step regardless of theme
- **Secondary**: transparent background, `border-subtle` border, `text-primary` text

### Status badges
Small pill, 4px radius, colored dot + label using the status color table
(2.4) — identical in both themes. Sentence case labels: "Healthy",
"Degraded", "Fault active", "Recovering" — never "HEALTHY" in caps.

### Charts
- Line charts for latency/error-rate over time
- Fault windows: shaded band, `status-critical` at 15–20% opacity
- Recovery point: a single small marker in `status-recovering`
- Grid lines: `border-subtle`, very low visual weight

### Theme toggle
Lives in the top bar, not buried in settings — this product is used in
long sessions, and switching between "watching a live experiment" (dark)
and "reading a report" (light) is a real, frequent use case, not a rarely
touched preference.

### Empty / error states
Written in the interface's voice, plain and directive — e.g. "No services
discovered yet. Add the `chaosguard.target=true` label to a service in your
compose file, then refresh."

---

## 6. Motion

Motion is used only to show what changed, never as decoration:
- A metric value that updates live may briefly flash its background at 10%
  opacity in the relevant status color, then fade
- Fault-window shading fades in over ~200ms when a fault starts
- Theme switch cross-fades background/text colors over ~150ms rather than
  snapping instantly
- No page-load fade-ins, no hover-lift on every card

---

## 7. Accessibility & Quality Floor

- Minimum contrast ratio 4.5:1 for all text against its background in
  **both themes** — verify `text-secondary` against `bg-surface`
  specifically in each theme, since these are the easiest pairings to get
  wrong
- Visible keyboard focus ring on all interactive elements, using `accent-signal` (theme-appropriate value)
- Respect `prefers-reduced-motion` — disable the live-update flash, fade
  transitions, and theme cross-fade when set
- Status must never be conveyed by color alone — every status badge pairs
  color with a text label and/or icon

---

## 8. Quick Reference for Agents

When building any new screen or component:
1. Background: `bg-base` (page) / `bg-surface` (panels) — read from the active theme's tokens, never hardcode a hex
2. Headings/labels: Space Grotesk, sentence case, no letter-spacing tricks
3. Any number that represents a measurement: JetBrains Mono
4. Any color that represents system state: pull only from the 4 status tokens (2.4) — same in both themes
5. Any color that represents brand/interactive: `accent-signal` only, theme-specific value
6. Remember the ink/paper thread (2.3) if you're ever introducing a new shared element between themes
7. Borders over shadows; 6px radius on cards/buttons; left-aligned; no centered marketing-style blocks
8. If unsure whether something needs motion: it doesn't — add it back only if a reviewer asks
