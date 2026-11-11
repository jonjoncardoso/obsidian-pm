---
version: 1
slug: "src-views-referencestriageview-ts"
primary_target: "src/views/ReferencesTriageView.ts"
related_targets: ["src/store/attentionTriage.ts","src/styles/triage.css"]
---

# Surface: Attention Triage

Mode: Operate

Audience: a single knowledge worker scanning letter-like parent tasks with ordered step subtasks.

Job: see which parents need action now, which wait on someone else, and how far each pipeline has moved.

## Direction contract

THESIS: Four attention lanes plus equal step squares with vertical programme panes; refuse a fourth generic board that only repeats status columns.

OWN-WORLD: Incumbent Project Manager chrome (toolbar, chips, secondary surfaces). Step fills use Atelier secondary terracotta `#fd7452` for current, sage `#79b58d` for done, grey for waiting, empty outline for not started. Equal 28px outer squares; programme panes stack vertically when a stage has nested children.

STORY: Open Triage on an opted-in project. Scan lane headers, then card strips and the fixed legend. Open a card to edit the parent task.

FIRST VIEWPORT: Lanes stacked full width (Jon acts now, Waiting on student, Waiting on portal, Parked). Cards show title, next action, six step squares, hours strip, due. Legend pinned at the bottom.

FORM: Surface seed `aca25f18` dealt structure Attention triage lanes. Decision comps with live roster names were removed from this public tree; keep design notes here only.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Constraints

- Opt in with `config.attentionTriage: true` on the project note.
- Without the flag, Triage falls back to Table behind a modal.
- Optional body line `template_step_id:` groups steps and letter-suffix subversions.
