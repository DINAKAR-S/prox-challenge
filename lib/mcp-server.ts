import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { z } from "zod";

const ROOT = process.cwd();
const KNOWLEDGE_DIR = path.join(ROOT, "knowledge");
const INDEX_PATH = path.join(KNOWLEDGE_DIR, "index.json");
const PAGES_DIR = path.join(KNOWLEDGE_DIR, "pages");
const STRUCTURED_DIR = path.join(KNOWLEDGE_DIR, "structured");
const MANUAL_PUBLIC_DIR = path.join(ROOT, "public", "manual");

const STRUCTURED_CATEGORIES = [
  "duty-cycle",
  "polarity",
  "settings",
  "troubleshooting",
  "specs",
  "safety",
  "error-codes",
  "parts",
  "weld-diagnosis",
  "setup-steps",
] as const;

type IndexEntry = {
  page: number | string;
  source: string;
  topics: string[];
  summary: string;
};

async function loadIndex(): Promise<IndexEntry[] | null> {
  try {
    const raw = await readFile(INDEX_PATH, "utf-8");
    return JSON.parse(raw) as IndexEntry[];
  } catch {
    return null;
  }
}

function pad(n: number | string) {
  const s = String(n);
  return s.length < 2 ? `0${s}` : s;
}

async function readPageMarkdown(source: string, page: number | string): Promise<string | null> {
  // ponytail: contract says pages/manual-pXX.md; try a couple of reasonable
  // naming variants so minor drift between agents doesn't break search.
  const candidates = [
    `manual-p${pad(page)}.md`,
    `manual-p${page}.md`,
    `${source}-p${pad(page)}.md`,
    `${source}-p${page}.md`,
  ];
  for (const name of candidates) {
    try {
      return await readFile(path.join(PAGES_DIR, name), "utf-8");
    } catch {
      // try next candidate
    }
  }
  return null;
}

function score(entry: IndexEntry, terms: string[]): number {
  const haystack = `${entry.summary} ${entry.topics.join(" ")} ${entry.source}`.toLowerCase();
  return terms.reduce((acc, t) => (haystack.includes(t) ? acc + (entry.topics.some((x) => x.toLowerCase().includes(t)) ? 2 : 1) : acc), 0);
}

/** Event pushed out of a tool as it runs, so the route handler can forward it
 * to the client over SSE independently of Claude's own tool-result turn. */
export type AgentEvent =
  | { type: "tool_start"; name: string }
  | { type: "image"; url: string; caption: string; page: number | string; source: string }
  | { type: "artifact"; title: string; html: string };

export function buildMcpServer(emit: (event: AgentEvent) => void) {
  const searchManual = tool(
    "search_manual",
    "Full-text search over the Vulcan OmniPro 220 manual knowledge base. Returns the markdown " +
      "content of the best-matching manual page(s). Use this before answering any question about " +
      "specs, procedures, settings, or troubleshooting.",
    {
      query: z.string().describe("What to search for, e.g. 'MIG duty cycle 240V' or 'TIG polarity'"),
    },
    async ({ query }) => {
      emit({ type: "tool_start", name: "search_manual" });
      const index = await loadIndex();
      if (!index) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "The manual knowledge base (knowledge/index.json) hasn't been built yet. Tell the " +
                "user the manual hasn't been indexed and you can't cite specifics right now.",
            },
          ],
        };
      }

      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const ranked = index
        .map((entry) => ({ entry, s: score(entry, terms) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 4);

      if (ranked.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No manual pages matched "${query}". Try a broader or differently-worded search.`,
            },
          ],
        };
      }

      const sections = await Promise.all(
        ranked.map(async ({ entry }) => {
          const md = await readPageMarkdown(entry.source, entry.page);
          const body = md ?? `(page text unavailable for ${entry.source} p.${entry.page})`;
          return `### ${entry.source}, page ${entry.page}\n${body}`;
        })
      );

      return { content: [{ type: "text" as const, text: sections.join("\n\n---\n\n") }] };
    }
  );

  const showManualImage = tool(
    "show_manual_image",
    "Surface a real page image/diagram from the manual to the user (front panel, wiring schematic, " +
      "duty cycle chart, weld diagnosis photos, etc). Prefer this over describing spatial or visual " +
      "content in words.",
    {
      source: z.string().describe("Manual source, e.g. 'owner-manual', 'quick-start-guide', 'selection-chart'"),
      page: z.union([z.number(), z.string()]).describe("Page number the image is from"),
      caption: z.string().describe("Short caption explaining what this image shows"),
    },
    async ({ source, page, caption }) => {
      emit({ type: "tool_start", name: "show_manual_image" });
      const url = `/manual/${source}-p${page}.png`;
      const exists = existsSync(path.join(MANUAL_PUBLIC_DIR, `${source}-p${page}.png`));
      emit({ type: "image", url, caption, page, source });
      return {
        content: [
          {
            type: "text" as const,
            text: exists
              ? `Shown to user: ${caption} (${url})`
              : `Tried to show ${url} but that image file doesn't exist yet — tell the user the ` +
                `page image hasn't been generated. Still describe what's on the page from the text.`,
          },
        ],
      };
    }
  );

  const lookupData = tool(
    "lookup_data",
    "Look up exact structured data (numbers, part numbers, codes) from the manual, e.g. duty " +
      "cycles, polarity sockets, settings, specs, error codes, parts, weld defects, setup steps. " +
      "Prefer this over search_manual when the user needs a precise value, not prose.",
    {
      category: z.enum(STRUCTURED_CATEGORIES).describe("Which structured data file to query"),
      filter: z.string().optional().describe("Case-insensitive substring to filter entries by, e.g. 'MIG' or '240V'"),
    },
    async ({ category, filter }) => {
      emit({ type: "tool_start", name: "lookup_data" });
      let entries: unknown[];
      try {
        const raw = await readFile(path.join(STRUCTURED_DIR, `${category}.json`), "utf-8");
        entries = JSON.parse(raw);
      } catch {
        return {
          content: [
            { type: "text" as const, text: `knowledge/structured/${category}.json hasn't been built yet.` },
          ],
        };
      }
      const matches = filter
        ? entries.filter((e) => JSON.stringify(e).toLowerCase().includes(filter.toLowerCase()))
        : entries;
      return { content: [{ type: "text" as const, text: JSON.stringify(matches, null, 2) }] };
    }
  );

  const renderArtifact = tool(
    "render_artifact",
    "Render a self-contained interactive HTML artifact (calculator, flowchart, live diagram, " +
      "configurator) in a sandboxed frame for the user. Use for anything too complex or spatial to " +
      "explain in text alone.",
    {
      title: z.string().describe("Short title shown above the artifact"),
      html: z.string().describe("Full self-contained HTML (inline <style>/<script>, no external resources)"),
    },
    async ({ title, html }) => {
      emit({ type: "tool_start", name: "render_artifact" });
      emit({ type: "artifact", title, html });
      return { content: [{ type: "text" as const, text: `Rendered artifact "${title}" to the user.` }] };
    }
  );

  return createSdkMcpServer({
    name: "welder-support",
    version: "1.0.0",
    tools: [searchManual, showManualImage, lookupData, renderArtifact],
  });
}
