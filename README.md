# Vulcan OmniPro 220 — AI Support Agent

A multimodal support agent for the [Vulcan OmniPro 220](https://www.harborfreight.com/omnipro-220-industrial-multiprocess-welder-with-120240v-input-57812.html) multiprocess welder, built on the **Claude Agent SDK** for the [Prox engineering challenge](https://github.com/prox-technologies/prox-challenge).

Ask it anything a new owner would ask — duty cycles, polarity setup, porosity troubleshooting — and it answers with exact page-cited numbers, real manual images, and live-generated interactive diagrams and calculators.

> **Hosted demo:** _coming shortly_ · **Video walkthrough:** _coming shortly_

---

## Quick start (under 2 minutes)

```bash
git clone https://github.com/DINAKAR-S/prox-challenge
cd prox-challenge
cp .env.example .env   # put your ANTHROPIC_API_KEY here
npm install
npm run dev            # → http://localhost:3000
```

That's it. The knowledge base and all manual page images are pre-built and committed — nothing to ingest, no second API key, no database.

## How it works

```
                         ┌─────────────────────────────────────┐
 User ──► Next.js chat ──► /api/chat (SSE) ──► Claude Agent SDK │
                         │                        │  loop        │
                         │        ┌───────────────┼───────────┐ │
                         │        ▼               ▼           ▼ │
                         │  search_manual    lookup_data   render_artifact
                         │  (index + pages)  (exact JSON)  (live HTML/SVG)
                         │        │               │           │
                         │        ▼               ▼           ▼
                         │  knowledge/pages  knowledge/    sandboxed
                         │  (51 .md files)   structured/   iframe in chat
                         │                   (10 .json)
                         │  show_manual_image ──► public/manual/*.png
                         └─────────────────────────────────────┘
```

The agent runs a real tool-use loop (Claude Agent SDK, in-process MCP server) with four tools:

| Tool | What it does |
|---|---|
| `search_manual` | Reads `knowledge/index.json` (a per-page table of contents), scores pages by topic, returns the full markdown of relevant pages |
| `lookup_data` | Exact-value lookups from 10 structured JSON tables — duty cycles, polarity, specs, settings, troubleshooting, error codes, parts, weld diagnosis, setup steps, safety |
| `show_manual_image` | Surfaces the actual manual page as an image card in chat (all 51 pages pre-rendered to PNG) |
| `render_artifact` | The agent writes self-contained HTML/SVG/JS on the fly — polarity diagrams, duty-cycle calculators, troubleshooting flowcharts — rendered in a sandboxed iframe |

Responses stream over SSE as typed events (`text`, `image`, `artifact`, `tool_start`, `error`, `done`), so images and widgets appear in the chat the moment the tool fires, not after the whole answer.

## Knowledge extraction — the real work

The manual is 48 pages where the most critical information exists **only in images**: the rating nameplate, duty-cycle matrices, polarity socket diagrams, the weld-diagnosis photo panels, the wiring schematic, the selection chart (which has no text layer at all).

Extraction was done once, offline, with vision models reading every rendered page:

- **`knowledge/pages/*.md`** — 51 files, one per page: faithful transcription, every table reproduced exactly, every figure described in detail (which cable enters which socket, what each weld defect looks like), safety warnings verbatim.
- **`knowledge/structured/*.json`** — 10 merged tables: 53 duty-cycle points, 14 polarity entries, 80 specs, 61 parts, 22 weld-diagnosis defects, 15 troubleshooting rows, error codes, setup steps. Every entry carries `source` + `page`.
- **`knowledge/index.json`** — the agent's table of contents: topics + one-line summary per page.

Two details worth calling out:

1. **Conflicting sources resolved, not averaged.** The manual states duty-cycle data in two places: a spec table (p. 7) and the rating nameplates (pp. 14, 25). The nameplates carry an extra 60%-duty datapoint the spec table lacks. Nameplate entries are flagged `"authoritative": true` and the system prompt prefers them — the abbreviated callouts are kept, page-cited, for traceability.
2. **Nothing invented.** Extraction rule was "null over guess": if a value wasn't literally on the page, the field is empty. The agent is likewise instructed to say "the manual doesn't state this" rather than fabricate a number — for a machine that outputs 220 amps, a made-up answer is a safety problem, not a UX problem.

## Design decisions

### Why no RAG / vector database (no Pinecone)

This was a deliberate choice, not an omission:

1. **The corpus is 51 pages.** RAG exists for corpora that can't be navigated directly — millions of documents. Here, the entire index (topics + summary per page) fits in a single tool response. The agent reads the table of contents like a human would, picks pages, and reads them in full. Nothing needs to be approximated.
2. **Vector search is fuzzy; welding specs need exact.** "Duty cycle at 200A on 240V" answered via embeddings means retrieving chunks *similar* to the question and hoping the right number survived chunking. Here it's `lookup_data("duty-cycle", "240V")` → the exact nameplate row, page-cited. Fuzzy retrieval of exact numbers is how systems become confidently wrong.
3. **Tables die in chunking.** A duty-cycle matrix sliced mid-row becomes a meaningless embedding. Instead, tables were extracted into structured JSON once, at build time, with vision. The hard work happened offline; runtime is a file read.
4. **The 2-minute rule.** Pinecone means a second API key, account setup, index provisioning, and an ingestion run before the first question works. This repo needs one key and `npm install`.
5. **Cost and latency.** Embedding calls and vector-DB round-trips on every question, forever — versus free, instant local JSON.

**In one line:** RAG answers *"what's roughly relevant?"* — this product needs *"what exactly is true on page 14?"* At this scale, agentic lookup over structured extraction beats vector retrieval on accuracy, setup friction, and cost.

**Where RAG *would* be right:** Prox at production scale — thousands of product manuals behind one agent. Then the per-manual structured extraction shown here becomes the ingestion pipeline, and a vector index over the extracted (not raw) content becomes the top-level router that picks the product; the within-manual answering stays exactly like this.

### Why Claude Agent SDK (not a hand-rolled loop)

The SDK provides the agent loop, streaming, session resumption, and in-process MCP tool registration out of the box. The interesting code in this repo is the tools and the knowledge — not plumbing.

### Why multimodal-first

The system prompt treats text as the fallback, not the default: exact values come from `lookup_data`, spatial/setup answers surface the real manual diagram via `show_manual_image`, and anything cognitively heavy (which socket, what settings, what's my duty-cycle budget) gets a rendered artifact. When something is too hard to explain in words, the agent draws it.

## Project structure

```
app/                    Next.js 14 App Router UI + /api/chat SSE route
lib/system-prompt.ts    Persona + tool-routing rules
lib/mcp-server.ts       In-process MCP server: the four tools
knowledge/              Pre-extracted knowledge base (committed)
  pages/                51 per-page markdown transcriptions
  structured/           10 exact-value JSON tables
  index.json            Retrieval table of contents
public/manual/          All 51 manual pages as PNG
scripts/pdf-to-png.mjs  Regenerates the PNGs from files/ (already run)
files/                  Original PDFs (untouched)
```

## Tech

Next.js 14 · TypeScript · Tailwind · `@anthropic-ai/claude-agent-sdk` · single env var: `ANTHROPIC_API_KEY`

---

*Built by [Dinakar Selvakumar](https://github.com/DINAKAR-S) for the Prox engineering challenge.*
