"use client";

import { marked } from "marked";
import { FormEvent, useRef, useState } from "react";

type Part =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; caption: string; page: number | string; source: string }
  | { kind: "artifact"; title: string; html: string };

type ChatMessage = { role: "user" | "assistant"; parts: Part[] };

const SAMPLE_QUESTIONS = [
  "Duty cycle for MIG at 200A on 240V?",
  "TIG polarity setup?",
  "Porosity in flux-core welds",
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const sessionId = useRef<string | undefined>(undefined);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    setInput("");
    setBusy(true);
    setStatus(null);
    setMessages((m) => [...m, { role: "user", parts: [{ kind: "text", text: question }] }, { role: "assistant", parts: [] }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, sessionId: sessionId.current }),
      });
      if (!res.body) throw new Error("No response stream from server");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      const updateLastAssistant = (fn: (parts: Part[]) => Part[]) => {
        setMessages((m) => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant") next[next.length - 1] = { ...last, parts: fn(last.parts) };
          return next;
        });
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const eventLine = chunk.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice("event: ".length);
          const data = JSON.parse(dataLine.slice("data: ".length));

          if (event === "session") {
            sessionId.current = data.sessionId;
          } else if (event === "tool_start") {
            setStatus(
              data.name === "search_manual"
                ? "Searching the manual..."
                : data.name === "show_manual_image"
                ? "Pulling up a manual image..."
                : "Building a visual..."
            );
          } else if (event === "text") {
            setStatus(null);
            updateLastAssistant((parts) => {
              const last = parts[parts.length - 1];
              if (last?.kind === "text") {
                return [...parts.slice(0, -1), { kind: "text", text: last.text + data.delta }];
              }
              return [...parts, { kind: "text", text: data.delta }];
            });
          } else if (event === "image") {
            setStatus(null);
            updateLastAssistant((parts) => [
              ...parts,
              { kind: "image", url: data.url, caption: data.caption, page: data.page, source: data.source },
            ]);
          } else if (event === "artifact") {
            setStatus(null);
            updateLastAssistant((parts) => [...parts, { kind: "artifact", title: data.title, html: data.html }]);
          } else if (event === "error") {
            setStatus(null);
            updateLastAssistant((parts) => [...parts, { kind: "text", text: `\n\n**Error:** ${data.message}` }]);
          } else if (event === "done") {
            setStatus(null);
          }
        }
      }
    } catch (err) {
      setStatus(null);
      setMessages((m) => [
        ...m,
        { role: "assistant", parts: [{ kind: "text", text: `Connection error: ${err instanceof Error ? err.message : String(err)}` }] },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <main className="mx-auto flex h-dvh max-w-3xl flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/product.webp" alt="Vulcan OmniPro 220" className="h-12 w-12 rounded object-cover" />
        <div>
          <h1 className="text-sm font-semibold tracking-wide text-text">VULCAN OMNIPRO 220</h1>
          <p className="text-xs text-muted">Welding support agent</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-muted">Ask anything about setup, settings, or troubleshooting.</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={busy}
                  className="rounded-full border border-border bg-panel px-3 py-1.5 text-xs text-text hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  msg.role === "user"
                    ? "max-w-[85%] rounded-lg bg-accent/90 px-3 py-2 text-sm text-black"
                    : "max-w-[90%] space-y-2"
                }
              >
                {msg.parts.map((part, j) => (
                  <MessagePart key={j} part={part} />
                ))}
                {msg.role === "assistant" && msg.parts.length === 0 && i === messages.length - 1 && (
                  <p className="text-xs text-muted">{status ?? "Thinking..."}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {status && messages.length > 0 && (
        <p className="px-4 pb-1 text-xs text-accent">{status}</p>
      )}

      <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-border p-3">
        <button
          type="button"
          disabled
          title="Voice input coming soon"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted opacity-50"
        >
          🎤
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about setup, settings, or a problem you're seeing..."
          className="flex-1 rounded-full border border-border bg-panel px-4 py-2 text-sm text-text outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </main>
  );
}

function MessagePart({ part }: { part: Part }) {
  if (part.kind === "text") {
    // ponytail: model output rendered as trusted markdown -> HTML, no sanitizer dep.
    // Fine for a local single-user demo; add DOMPurify if this ever faces untrusted input.
    const html = marked.parse(part.text, { async: false }) as string;
    return <div className="prose-manual rounded-lg bg-panel px-3 py-2 text-sm text-text" dangerouslySetInnerHTML={{ __html: html }} />;
  }

  if (part.kind === "image") {
    return (
      <figure className="overflow-hidden rounded-lg border border-border bg-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={part.url} alt={part.caption} className="w-full" />
        <figcaption className="px-3 py-2 text-xs text-muted">
          {part.caption} <span className="text-muted/70">— {part.source}, p.{part.page}</span>
        </figcaption>
      </figure>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-panel">
      <p className="border-b border-border px-3 py-1.5 text-xs font-semibold text-accent">{part.title}</p>
      <iframe
        sandbox="allow-scripts"
        srcDoc={part.html}
        className="h-80 w-full bg-white"
        title={part.title}
      />
    </div>
  );
}
