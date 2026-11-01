import { analyze } from "@/lib/analyze";
import type { Source } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Streams newline-delimited JSON: {"type":"progress",...} events, then a final
// {"type":"result","analysis":...} or {"type":"error",...}.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { question?: string; sources?: Source[] } | null;
  const question = body?.question?.trim();
  const sources = (body?.sources ?? []).filter((s) => s.text?.trim());
  if (!question || !sources.length) {
    return Response.json({ error: "A question and at least one source with text are required." }, { status: 400 });
  }
  const normalized: Source[] = sources.slice(0, 8).map((s, i) => ({
    ...s,
    id: `S${i + 1}`,
    title: s.title?.trim() || `Source ${i + 1}`,
    text: s.text.slice(0, 40000),
    official: Boolean(s.official),
  }));

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        const analysis = await analyze(question, normalized, (stage, detail) => send({ type: "progress", stage, detail }));
        send({ type: "result", analysis });
      } catch (e) {
        send({ type: "error", error: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
