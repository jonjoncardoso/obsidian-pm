# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: a single knowledge worker planning and tracking multi-project work inside Obsidian.
Situation: weekly planning and mid-week triage in the Sprint view, often with dozens to hundreds of open cards.
Job: decide what deserves attention this week by importance, urgency, and how large the work already is.

*(Inferred from this fork’s Sprint Matrix usage and confirmed session brief; not a marketplace-wide claim.)*

## Product Purpose

Project Manager keeps projects and tasks as plain Markdown in the vault and offers Table, Gantt, Kanban, and (in this fork) Sprint planning views over that data.
Success for Sprint Matrix Flat: the planner can scan a quadrant and see which cards are heavy in time, without opening each note.

## Positioning

Vault-native project management with no external PM service: the same files power lists, timelines, and Sprint triage.
This fork’s Sprint Matrix adds Eisenhower placement plus effort-aware Flat scanning for weekly work.

## Operating Context

Obsidian desktop, light theme in daily use.
Sprint Matrix Flat rows already show status, title, due, time chip (logged/estimate), and a root-coloured path chip.
Quadrant cells use soft paper washes (I–IV).
Cards carry `timeEstimate`, `timeLogs`, `priority`, and custom `urgency`.

## Capabilities and Constraints

- Must preserve Obsidian plugin affordances and existing Sprint toolbar (List|Matrix, Tree|Flat, Project filter, Hide done, Close week).
- Public fork: no private workspace names in source or commits.
- Incumbent visual system lives in `src/styles/` (especially `sprint.css`); missing DESIGN.md is a documentation gap, not a blank slate.
- Open: how Matrix Flat should show effort magnitude without fighting quadrant paper or collapsing into decorative chrome.

## Brand Commitments

None beyond the upstream Project Manager product name and this fork’s existing Sprint chrome (status chips, path chips, quadrant accents).

## Evidence on Hand

- Live Sprint Matrix Flat with real vault cards (often 100+).
- Existing time chip already turns solid red when logged exceeds estimate.
- User rejected louder time-chip scaling and full-row wash stains as the size cue.

## Product Principles

1. Operate density over decoration: the tool disappears into weekly triage.
2. Several cues beat colour alone: order, measure, and state stay readable together.
3. Inherit Sprint chrome; extend Flat rows rather than inventing a parallel view.
4. Measurement stays measurement: hours remain tabular and honest.
5. Do not stain quadrant paper with a second wash system.

## Accessibility & Inclusion

Title and measure text must keep at least 4.5:1 contrast on quadrant paper and on any effort treatment.
Colour is never the only effort cue.
