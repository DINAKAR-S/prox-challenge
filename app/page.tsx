"use client";

import { marked } from "marked";
import { FormEvent, useEffect, useRef, useState } from "react";

type Part =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; caption: string; page: number | string; source: string }
  | { kind: "artifact"; title: string; html: string };

type ChatMessage = { role: "user" | "assistant"; parts: Part[] };

const SUGGESTIONS = [
  { icon: "⚙️", title: "Duty cycle at 200A/240V", q: "What's the duty cycle at 200A on 240V input?" },
  { icon: "🔌", title: "TIG polarity setup", q: "How do I set up TIG polarity correctly?" },
  { icon: "💧", title: "Flux-core porosity", q: "Why is my flux-core weld porous, and how do I fix it?" },
  { icon: "🔥", title: 'Help me set up MIG for 1/8-inch steel', q: "Help me set up MIG for 1/8-inch steel" },
];

// ponytail: tool -> status label map. Unknown future tools fall back to a
// generic label instead of lying about what's happening.
const TOOL_LABELS: Record<string, string> = {
  search_manual: "Reading the manual…",
  lookup_data: "Looking up exact specs…",
  show_manual_image: "Pulling up the diagram…",
  render_artifact: "Drawing this for you…",
};

const GENERIC_PHASES = ["Thinking…", "Putting it together…"];
const SPEC_PHASES = ["Checking exact specs…", "Reading the nameplate…"];
const DIAGNOSTIC_PHASES = ["Diagnosing the symptom…", "Checking the troubleshooting chart…"];
const SETUP_PHASES = ["Pulling up the setup pages…", "Checking cable routing…"];

// ponytail: cheap client-side keyword guess at what the answer needs, purely
// to pick a plausible loading-label set. No API call, no cost if wrong.
function pickPhases(question: string): string[] {
  const q = question.toLowerCase();
  if (/duty cycle|amps?|volt|spec|setting|wire speed/.test(q)) return SPEC_PHASES;
  if (/porosity|spatter|problem|issue|error|fix|trouble|weld looks/.test(q)) return DIAGNOSTIC_PHASES;
  if (/setup|install|connect|polarity|socket|cable/.test(q)) return SETUP_PHASES;
  return GENERIC_PHASES;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [phases, setPhases] = useState<string[]>(GENERIC_PHASES);
  const [micSupported, setMicSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const sessionId = useRef<string | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    setMicSupported(!!SR);
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript as string;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setBusy(true);
    setStatus(null);
    setPhases(pickPhases(question));
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
            setStatus(TOOL_LABELS[data.name] ?? "Working on it…");
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

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  const COLUMN = "mx-auto max-w-3xl xl:max-w-4xl 2xl:max-w-5xl";

  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-bg/85 backdrop-blur">
        <div className={`flex items-center gap-3 px-4 py-3 ${COLUMN}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/product.webp" alt="Vulcan OmniPro 220" className="h-9 w-9 rounded-full object-cover ring-1 ring-border" />
          <div>
            <h1 className="text-sm font-semibold leading-tight text-text">Vulcan OmniPro 220</h1>
            <p className="text-xs leading-tight text-muted">AI Support Agent</p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className={`px-4 py-6 ${COLUMN}`}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center px-2 pt-14 text-center sm:pt-24">
              <h2 className="text-3xl font-semibold text-text sm:text-4xl">What are we welding today?</h2>
              <p className="mt-3 max-w-md text-sm text-muted">
                Ask about setup, settings, or a problem you're seeing — grounded in the Vulcan OmniPro 220 manual.
              </p>
              <div className="mt-8 w-full max-w-2xl">
                <Composer
                  size="lg"
                  input={input}
                  busy={busy}
                  listening={listening}
                  micSupported={micSupported}
                  textareaRef={textareaRef}
                  onChange={onInputChange}
                  onKeyDown={onKeyDown}
                  onSubmit={onSubmit}
                  onMicToggle={toggleMic}
                />
              </div>
              <div className="mt-6 flex w-full max-w-xl flex-col divide-y divide-border/60 overflow-hidden rounded-3xl border border-border/60">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => send(s.q)}
                    disabled={busy}
                    className="flex items-center gap-3 px-4 py-3 text-left transition duration-150 hover:bg-panel disabled:opacity-50"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-base">{s.icon}</span>
                    <span className="text-sm text-text">{s.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg, i) => {
                const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;
                return (
                  <div key={i}>
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[80%] rounded-2xl bg-accent/10 px-4 py-2.5 text-sm text-text ring-1 ring-accent/15">
                          {msg.parts.map((p, j) => (p.kind === "text" ? <span key={j} className="whitespace-pre-wrap">{p.text}</span> : null))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <WelderAvatar />
                        <div className="min-w-0 flex-1 space-y-3">
                          {msg.parts.length === 0 && isLastAssistant && busy && <StatusIndicator status={status} phases={phases} />}
                          {msg.parts.map((part, j) => (
                            <MessagePart
                              key={j}
                              part={part}
                              streaming={busy && isLastAssistant && j === msg.parts.length - 1 && part.kind === "text"}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <footer className={`sticky bottom-0 ${messages.length > 0 ? "border-t border-border/70 bg-bg/85 backdrop-blur" : ""}`}>
        <div className={`px-4 py-3 ${COLUMN}`}>
          {messages.length > 0 && (
            <Composer
              size="sm"
              input={input}
              busy={busy}
              listening={listening}
              micSupported={micSupported}
              textareaRef={textareaRef}
              onChange={onInputChange}
              onKeyDown={onKeyDown}
              onSubmit={onSubmit}
              onMicToggle={toggleMic}
            />
          )}
          <p className="mt-2 text-center text-[11px] text-muted">
            Answers cite the Vulcan OmniPro 220 manual. Always verify safety-critical settings.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Composer({
  size,
  input,
  busy,
  listening,
  micSupported,
  textareaRef,
  onChange,
  onKeyDown,
  onSubmit,
  onMicToggle,
}: {
  size: "lg" | "sm";
  input: string;
  busy: boolean;
  listening: boolean;
  micSupported: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: FormEvent) => void;
  onMicToggle: () => void;
}) {
  const big = size === "lg";
  return (
    <form
      onSubmit={onSubmit}
      className={`flex items-end gap-1.5 rounded-full border border-border bg-panel shadow-lg shadow-black/20 transition duration-200 focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/30 ${
        big ? "px-4 py-3" : "px-2 py-2"
      }`}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={input}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={big ? "Ask anything about your welder…" : "Ask about setup, settings, or a problem you're seeing…"}
        className={`max-h-40 flex-1 resize-none bg-transparent text-text outline-none placeholder:text-muted ${
          big ? "px-2 py-2 text-base" : "px-2 py-1.5 text-sm"
        }`}
      />
      {micSupported && (
        <button
          type="button"
          onClick={onMicToggle}
          title={listening ? "Stop listening" : "Speak your question"}
          className={`flex shrink-0 items-center justify-center rounded-full text-base transition duration-200 ${
            big ? "h-10 w-10" : "h-9 w-9"
          } ${listening ? "animate-pulse bg-red-500/20 text-red-400" : "text-muted hover:text-text"}`}
        >
          🎤
        </button>
      )}
      <button
        type="submit"
        disabled={busy || !input.trim()}
        title="Send"
        className={`flex shrink-0 items-center justify-center rounded-full bg-accent text-black transition duration-200 disabled:cursor-not-allowed disabled:bg-border disabled:text-muted ${
          big ? "h-10 w-10" : "h-9 w-9"
        }`}
      >
        <SendIcon />
      </button>
    </form>
  );
}

function StatusIndicator({ status, phases }: { status: string | null; phases: string[] }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % phases.length), 2500);
    return () => clearInterval(id);
  }, [phases]);
  const label = status ?? phases[phase % phases.length];
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="spinner-ring" aria-hidden />
      <span key={label} className="status-label text-sm text-muted">
        {label}
      </span>
    </div>
  );
}

function WelderAvatar() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-panel">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ff7a1a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10c0-4 3.5-7 8-7s8 3 8 7v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3Z" />
        <rect x="8" y="10" width="8" height="4" rx="1" />
        <path d="M9 18v2M15 18v2" />
      </svg>
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }
  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base text-muted transition duration-200 hover:text-text"
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function MessagePart({ part, streaming }: { part: Part; streaming?: boolean }) {
  if (part.kind === "text") return <TextPart text={part.text} streaming={streaming} />;
  if (part.kind === "image") return <ImagePart part={part} />;
  return <ArtifactPart part={part} />;
}

function TextPart({ text, streaming }: { text: string; streaming?: boolean }) {
  // ponytail: model output rendered as trusted markdown -> HTML, no sanitizer dep.
  // Fine for a local single-user demo; add DOMPurify if this ever faces untrusted input.
  const html = marked.parse(text, { async: false }) as string;
  return (
    <div
      className={`prose-manual text-sm text-text${streaming ? " streaming" : ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ImagePart({ part }: { part: Extract<Part, { kind: "image" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <figure className="media-breakout overflow-hidden rounded-2xl border border-border bg-panel">
        <button type="button" onClick={() => setOpen(true)} className="block w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={part.url} alt={part.caption} className="max-h-80 w-full bg-panel object-contain" />
        </button>
        <figcaption className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted">
          <span>{part.caption}</span>
          <span className="shrink-0 text-muted/70">
            {part.source} · p.{part.page}
          </span>
        </figcaption>
      </figure>
      {open && (
        <div
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-6"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={part.url} alt={part.caption} className="max-h-full max-w-full rounded-2xl object-contain" />
        </div>
      )}
    </>
  );
}

function ArtifactPart({ part }: { part: Extract<Part, { kind: "artifact" }> }) {
  return (
    <div className="media-breakout overflow-hidden rounded-2xl border border-border bg-panel">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-semibold text-accent">
        <span aria-hidden>▦</span>
        <span>{part.title}</span>
      </div>
      <iframe sandbox="allow-scripts" srcDoc={part.html} className="h-96 w-full bg-white" title={part.title} />
    </div>
  );
}
