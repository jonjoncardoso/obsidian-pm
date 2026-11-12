---
version: 1
slug: "src-views-emailtriageview-ts"
primary_target: "src/views/EmailTriageView.ts"
related_targets: ["src/store/emailTriage.ts","src/styles/email-triage.css"]
---

# Surface: Email Triage

Mode: Operate

Audience: a single knowledge worker scanning mail-scan request and promise threads on a project with `emailTriage: true`.

Job: see which threads still ask for a reply or a delivered promise, which wait, and which can stay parked.

## Direction contract

THESIS: Four debt sections as a paper ledger of full-width rows, plus request and promise chips; refuse a six-step letter strip, refuse life-area columns, refuse a card mosaic.

OWN-WORLD: Paper Ledger. Incumbent Project Manager chrome. Terracotta `#fd7452` for Act now, Ink Navy `#001360` for Deliver and next-step primary, Ochre `#a67c3d` for Waiting, Slate `#6b6e66` for Parked. Soft 4% section paper, 1px accent edge, rows stacked in a white list panel (not a card mosaic, not a bare full-bleed sheet).

STORY: Open Triage on Email. Scan Act now, then Deliver, then Waiting. Parked stays collapsed until shown. Open the next-step child as the primary action, or the thread title for the parent.

FIRST VIEWPORT: Soft paper sections; each holds a dense row list (thread + next step stacked, chips, due). Narrow pane stacks all four. Wide pane (≥900px container): Act now left, Deliver / Waiting / Parked stacked right. Parked is Show/Hide with count.

FORM: Document interview 2026-11-12 (Paper Ledger) applied as layout redesign after quieter polish left the old mosaic on screen.

FINISH: Ledger redesign built 2026-11-12. Jon confirmed the wide two-column ledger looks much nicer.

## Constraints

- Opt in with `config.emailTriage: true` on the project note.
- Without the flag, Triage falls back to Table behind a modal (same chrome as Attention triage).
- Resolve child→parent from the body `Parent:` wikilink; frontmatter `parentId` wikilinks are often truncated.
- Do not invent a waiting-on kind; reserve the Waiting lane for blocked parents until the scanner grows one.
