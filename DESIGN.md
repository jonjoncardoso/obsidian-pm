---
name: Project Manager (fork)
description: Vault project views with dense operate chrome and paper lane triage
colors:
  terracotta: "#fd7452"
  terracotta-deep: "#a9371b"
  ink-navy: "#001360"
  sage: "#79b58d"
  sage-deep: "#5a9470"
  ochre: "#a67c3d"
  slate: "#6b6e66"
  request-ink: "#7a3532"
  lilac: "#8b72be"
  waiting-fill: "#c8c8c4"
  empty-fill: "#dcdcd7"
  empty-stroke: "#5c5f58"
  step-ink: "#1a1a1a"
typography:
  title:
    fontFamily: "var(--font-interface)"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "var(--font-interface)"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
  label:
    fontFamily: "var(--font-interface)"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
rounded:
  s: "var(--radius-s)"
  m: "var(--radius-m)"
spacing:
  board: "12px 16px 8px"
  lane-gap: "14px"
  card-gap: "10px"
  card-pad: "10px 12px 12px"
components:
  triage-card:
    backgroundColor: "var(--background-primary)"
    textColor: "var(--text-normal)"
    rounded: "{rounded.m}"
    padding: "{spacing.card-pad}"
    width: "253px"
  chip-request:
    backgroundColor: "color-mix(in srgb, #fd7452 18%, transparent)"
    textColor: "{colors.request-ink}"
    rounded: "4px"
    padding: "4px 7px"
    typography: "{typography.label}"
  chip-promise:
    backgroundColor: "color-mix(in srgb, #001360 12%, transparent)"
    textColor: "{colors.ink-navy}"
    rounded: "4px"
    padding: "4px 7px"
    typography: "{typography.label}"
---

# Design System: Project Manager (fork)

## Overview

<!-- vale Jon.NorthStar = NO -->
**Creative North Star: "Paper Ledger"**
<!-- vale Jon.NorthStar = YES -->

This fork keeps Project Manager as a vault desk tool: dense, built for scanning first, and warm enough for academic admin work without becoming a productivity dashboard. Triage and Sprint views borrow Obsidian theme tokens for paper and ink, then spend a small accent budget on lane meaning.

The anti-reference is neon productivity apps. Saturated washes, floating card shadows, and tutorial legends on every visit are out of scope. Colour marks debt or progress. It does not decorate empty space.

**Key Characteristics:**
- Operate density over decoration
- Obsidian theme face and theme tokens first
- 4% lane tints; flat cards at rest
- Accents name state (reply owed, promised, done, waiting), not brand theatre
- Soft hover lift; structural shadows on modals only

## Colors

Warm academic admin palette: terracotta and ink for action debt, sage for done, ochre and slate for waiting and parked, lilac for a secondary wait lane in References triage.

### Primary
- **Terracotta** (#fd7452): Act-now lane accent, current step fill, request chip wash.
- **Terracotta Deep** (#a9371b): Current-step border and next-step hover ink.

### Secondary
- **Ink Navy** (#001360): Deliver lane accent, promise chips, primary next-step text.
- **Sage** (#79b58d) / **Sage Deep** (#5a9470): Done marks on step strips.

### Tertiary
- **Ochre** (#a67c3d): Waiting lanes.
- **Lilac** (#8b72be): References waiting-student lane only.
- **Slate** (#6b6e66): Parked lanes and muted structural ink.

### Neutral
- Paper, borders, and body text come from Obsidian (`--background-primary`, `--background-modifier-border`, `--text-normal`, `--text-muted`, `--text-faint`, `--text-error`, `--color-orange`, `--interactive-accent`). Do not hardcode white paper or grey card chrome in fork views.

### Rules
**The Four Percent Rule.** Lane washes mix the lane accent at 4% into transparent (or the theme paper token). Stronger pastel bands are a regression.
**The Accent Budget Rule.** Accent colour marks meaning on ≤10% of a triage viewport: lane titles, chips, current steps. The rest stays theme neutral.

## Typography

**Display Font:** none for plugin chrome
**Body Font:** `var(--font-interface)` (Obsidian theme)
**Label/Mono Font:** same face; tabular nums on counts and hours

**Character:** Inherit the vault UI face. Hierarchy comes from size and weight, not a second type family.

### Hierarchy
- **Title** (600, 13px, 1.35): Card and row titles.
- **Body** (400–600, 12px, 1.35): Next-step lines, meta, due dates.
- **Label** (600, 11px, 1): Chips and compact measures.

### Rules
**The Theme Face Rule.** Prefer the theme face; never invent a display font for plugin chrome.

## Layout

Triage boards are full-width stacked lanes with 14px vertical spacing and 12×16 padding. Cards wrap in a 253px mosaic with 10px spacing between cards. Sprint Matrix keeps its own quadrant paper; do not restain those cells with a second wash system. Density stays high enough for dozens of open cards in one scan.

## Elevation & Depth

Flat by default. Depth comes from 1px theme borders and 4% tints, not ambient card shadows. Soft hover may lift border colour toward muted text or lane accent. Structural shadows stay on modals only (`--pm-shadow-ambient` and related chrome), never on triage cards at rest.

### Rules
**The Flat Card Rule.** Triage and matrix cards ship without resting `box-shadow`. Modals may use ambient shadow.

<!-- vale Jon.Shape = NO -->
<!-- vale Jon.Anthropomorphism = NO -->
## Shapes
<!-- vale Jon.Anthropomorphism = YES -->
<!-- vale Jon.Shape = YES -->

Corners use Obsidian `--radius-m` on lanes and cards, `--radius-s` on compact chips and controls. Lanes keep a 3px left accent border (shared References and Email pattern). Cards are rectangles with theme borders; no hard offset / neobrutalist shadows.

## Components

Tactile and confident: clear press targets, visible focus rings, explicit primary actions.

### Chips
- **Style:** 11px semibold label, 4px radius, tinted wash from Terracotta (request) or Ink Navy (promise).
- **State:** Render only for counts above zero. Never show empty 0 chips.

### Cards / Containers
- **Corner Style:** `--radius-m`
- **Background:** `--background-primary`
- **Shadow Strategy:** none at rest; see Elevation
- **Border:** `--background-modifier-border`; hover may shift toward `--text-muted`
- **Internal Padding:** 10px 12px 12px
- **Width:** 253px mosaic cards in triage

### Signature: Triage lanes
- Left accent 3px in lane colour; 4% tint wash; title in accent; optional single-line subtitle in muted text; count tabular on the right.

### Signature: Email next step
- Primary control is the next-step line (Ink Navy, underlined text, focus ring). Thread title is a separate control that opens the parent. Do not nest both inside one button on the whole card.

### Signature: References step strip
- Equal outer squares; Terracotta current, Sage done, waiting grey fills, dashed empty; programme panes may stack given a stage with nested children.

## Do's and Don'ts

### Do:
- **Do** use Obsidian theme and text tokens for paper, borders, and body ink.
- **Do** keep lane washes at 4% and cards flat at rest.
- **Do** spend Terracotta and Ink Navy on debt meaning; Sage on done.
- **Do** make the next actionable child the primary control on Email triage cards.
- **Do** hide chips with a zero count.

### Don't:
- **Don't** hardcode `#ffffff` card fills or decorative resting shadows on triage cards.
- **Don't** raise lane washes into pastel dashboard bands.
- **Don't** invent a display font for plugin chrome.
- **Don't** put a permanent Legend strip on Email triage once chips are self-describing.
- **Don't** restain Sprint quadrant paper with a second wash system.
