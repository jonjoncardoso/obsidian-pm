# Surface: Sprint Matrix Flat effort

Mode: Operate

## Purpose

Help the planner see how large each live sprint card is while scanning Eisenhower quadrants in Matrix Flat.

## Direction contract

THESIS: Effort is a leading measure on the Flat row, aligned as a column, so heavy work reads before the title. Refuse full-row washes and refuse bundling cards under effort section headers.

OWN-WORLD: Incumbent Sprint Flat language only: status badge, 13px title, sm chips, root path chip, quadrant paper. Effort uses tabular figures in title ink; overrun uses the existing Q1 red on the measure alone.

STORY: Open cards sort heavier first (`max(estimate, logged)`). The eye hits status, then hours, then title. Logged-vs-estimate detail stays on the measure when both exist.

FIRST VIEWPORT: Each Flat row is `[effort | status | body]`. Effort is a fixed-width tabular column (hours share one vertical edge). Status is natural width. Body is a left-packed cluster of title, meta, and path. Empty effort cells still occupy the column. Tree layout and List columns stay untouched.

FORM: Local extension of Matrix Flat rows (established Sprint surface). No concept-seed; composition locked in session after wash rejection.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Anti-goals

- Full-row background stains for effort
- Left accent bars
- Sparklines or progress meters standing in for hours
- Bigger title fonts for heavy cards
- Path or effort section headers inside a quadrant
