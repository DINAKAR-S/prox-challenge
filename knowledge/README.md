# Knowledge — Vulcan OmniPro 220 (Item 57812)

Extracted knowledge base for the Vulcan OmniPro 220 multiprocess welder, built from the owner's
manual (48 pages), the quick-start guide (2 pages), and the process-selection chart (1 page).

## Layout

```
knowledge/
├── fragments/       raw per-batch extraction output (source of truth for structured/, do not edit)
├── pages/            51 per-page markdown files (1:1 with the source PDFs), used for full-text /
│                     citation-grade lookup
├── structured/       10 merged, deduplicated JSON files — one per topic, queryable across all
│                     three source documents
├── index.json        table of contents over pages/ — one row per page, for retrieval
└── README.md          this file
```

### `fragments/` (raw extraction batches — immutable)

- `owner-manual-p01-16.json`, `owner-manual-p17-32.json`, `owner-manual-p33-48.json` — the owner's
  manual, extracted in three 16-page batches.
- `quick-start-and-chart.json` — the quick-start guide + selection chart.

These were merged into `structured/` and should not be hand-edited; re-run the merge if a fragment
is corrected.

### `pages/*.md`

One file per source page, e.g. `owner-manual-p14.md`, `quick-start-guide-p02.md`,
`selection-chart-p01.md`. Frontmatter:

```yaml
---
source: owner-manual | quick-start-guide | selection-chart
page: <int>            # page number within that source
topics: [kebab-case, tag, list]
---
```

Body is a markdown transcription/description of the page (headings, tables, figure descriptions,
warnings) — the highest-fidelity, most literal representation of each source page. Use these when
you need to quote or cite an exact page.

### `index.json`

Array of `{ source, page, file, topics, summary }`, one entry per file in `pages/`. This is the
table of contents for retrieval: scan `topics`/`summary` here first to find the right page(s),
then read the specific `pages/*.md` file(s).

### `structured/*.json`

Ten topic files, each a flat JSON array merged across all three source documents. Every entry
carries `source` and `page` so it can be traced back to a `pages/*.md` file. Field shapes below
match what's actually present (some fields are `null` on entries where the source page didn't
give that value — this is preserved, not dropped).

| File | Entry shape |
|---|---|
| `duty-cycle.json` | `{ process, voltageInput, amps, dutyCyclePercent, page, source, notes?, authoritative? }` |
| `polarity.json` | `{ process, electrodeSocket, groundSocket, polarityName, notes, page, source }` |
| `settings.json` | `{ process, material, thickness, wireSize, wireSpeed, voltage, amps, gas?, notes, page, source }` |
| `troubleshooting.json` | `{ symptom, causes[], remedies[], page, source }` |
| `specs.json` | `{ name, value, page, source }` |
| `safety.json` | `{ warning, page, source }` |
| `error-codes.json` | `{ code, meaning, remedy, page, source }` |
| `parts.json` | `{ partNumber, description, page, source }` |
| `weld-diagnosis.json` | `{ defect, appearance, causes[], remedies[], page, source }` |
| `setup-steps.json` | `{ process, steps[], page, source }` |

`source` is always one of `"owner-manual"`, `"quick-start-guide"`, `"selection-chart"`.

**`authoritative: true`** appears only in `duty-cycle.json`, on entries sourced from the welder's
rating nameplate as transcribed on owner-manual pages 14 and 25 (the full nameplate duty-cycle
matrix — every duty-cycle point for every process, at both 120V and 240V). Other duty-cycle
entries (pages 19, 23, 29, and the selection-chart's generic worked example on page 1) are
abbreviated "Rated Duty Cycle" callouts from elsewhere in the manual and are consistent with, but
less complete than, the nameplate — they're kept, not merged away, so each page's exact wording
stays traceable.

## Regenerating `structured/` and `index.json`

Both are mechanically derived (merge fragments → dedupe exact-duplicate entries → flag nameplate
duty-cycle rows; parse `pages/*.md` frontmatter + first heading → one line per page). If a
fragment or a page file changes, re-run the same merge to keep `structured/` and `index.json` in
sync — don't hand-edit the generated files except for a targeted `summary` fix in `index.json`.
