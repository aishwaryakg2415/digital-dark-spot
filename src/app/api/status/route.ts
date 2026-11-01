import { GROQ_MODEL, groqAvailable } from "@/lib/llm";

export const dynamic = "force-dynamic";

export function GET() {
  const ai = groqAvailable();
  return Response.json({ engine: ai ? "groq" : "heuristic", model: ai ? GROQ_MODEL : null });
}
