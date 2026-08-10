import { query } from "@anthropic-ai/claude-agent-sdk";
import { AgentEvent, buildMcpServer } from "@/lib/mcp-server";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

export const runtime = "nodejs";
export const maxDuration = 300;

const SERVER_NAME = "welder-support";

export async function POST(req: Request) {
  let body: { message?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  const { message, sessionId } = body;
  if (!message || typeof message !== "string") {
    return new Response("Missing 'message' string", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const emit = (e: AgentEvent) => {
        if (e.type === "tool_start") send("tool_start", { name: e.name });
        else if (e.type === "image") send("image", e);
        else if (e.type === "artifact") send("artifact", e);
      };

      try {
        const server = buildMcpServer(emit);
        let sessionSent = false;

        for await (const msg of query({
          prompt: message,
          options: {
            systemPrompt: SYSTEM_PROMPT,
            model: "claude-sonnet-5",
            settingSources: [],
            mcpServers: { [SERVER_NAME]: server },
            allowedTools: [
              `mcp__${SERVER_NAME}__search_manual`,
              `mcp__${SERVER_NAME}__lookup_data`,
              `mcp__${SERVER_NAME}__show_manual_image`,
              `mcp__${SERVER_NAME}__render_artifact`,
            ],
            permissionMode: "dontAsk",
            includePartialMessages: true,
            resume: sessionId || undefined,
            env: process.env as Record<string, string>,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any) {
          if (!sessionSent && msg.session_id) {
            send("session", { sessionId: msg.session_id });
            sessionSent = true;
          }

          if (msg.type === "stream_event") {
            const event = msg.event;
            if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
              send("text", { delta: event.delta.text });
            }
          } else if (msg.type === "result" && msg.subtype !== "success") {
            send("error", { message: msg.result ?? msg.subtype ?? "The agent hit an error." });
          }
        }

        send("done", {});
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Unknown server error" });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
