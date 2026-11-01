import Groq from "groq-sdk";
import type { z } from "zod";

export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

/**
 * Models used for per-source extraction. Groq rate limits are per model, so
 * spreading extraction over two models roughly doubles throughput on free keys.
 */
export const EXTRACT_MODELS = [
  ...new Set(
    (process.env.GROQ_EXTRACT_MODELS || `${GROQ_MODEL},openai/gpt-oss-20b`)
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
  ),
];

// gpt-oss models reason before answering; keep that short and out of the reply.
function reasoningFor(model: string): { reasoning_effort?: "low"; include_reasoning?: boolean } {
  return /gpt-oss/.test(model) ? { reasoning_effort: "low", include_reasoning: false } : {};
}

export function groqAvailable(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

let client: Groq | null = null;
function getClient(): Groq {
  if (!client) client = new Groq({ apiKey: process.env.GROQ_API_KEY, maxRetries: 0, timeout: 60_000 });
  return client;
}

function parseJsonLoose(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Model did not return JSON");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryAfterMs(e: InstanceType<typeof Groq.APIError>): number {
  const h = e.headers as Record<string, string> | Headers | undefined;
  const raw = h instanceof Headers ? h.get("retry-after") : h?.["retry-after"];
  const secs = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(secs) ? Math.min(20_000, secs * 1000 + 250) : 4000;
}

/**
 * One completion with rate-limit handling: on a 429, try the next model in
 * `models`; once every model has been tried, wait for Groq's retry-after.
 */
async function complete(models: string[], messages: Groq.Chat.ChatCompletionMessageParam[], maxTokens: number) {
  let lastErr: unknown;
  for (let round = 0; round < 4; round++) {
    for (const model of models) {
      try {
        const r = reasoningFor(model);
        return await getClient().chat.completions.create({
          ...r,
          model,
          temperature: 0.1,
          max_tokens: maxTokens + (r.reasoning_effort ? 800 : 0),
          response_format: { type: "json_object" },
          messages,
          stream: false,
        });
      } catch (e) {
        lastErr = e;
        if (e instanceof Groq.RateLimitError) continue;
        if (e instanceof Groq.InternalServerError || e instanceof Groq.APIConnectionError) {
          await sleep(1500);
          continue;
        }
        throw e;
      }
    }
    await sleep(lastErr instanceof Groq.RateLimitError ? retryAfterMs(lastErr) : 2000);
  }
  throw lastErr;
}

/**
 * Ask Groq for a JSON object and validate it with zod. On a schema mismatch the
 * model gets one retry with the validation error. `models` is tried in order.
 */
export async function groqJSON<T>(system: string, user: string, schema: z.ZodType<T>, maxTokens = 2000, models: string[] = [GROQ_MODEL]): Promise<T> {
  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await complete(models, messages, maxTokens);
    const content = res.choices[0]?.message?.content ?? "";
    try {
      const parsed = schema.safeParse(parseJsonLoose(content));
      if (parsed.success) return parsed.data;
      lastErr = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    } catch (e) {
      lastErr = (e as Error).message;
    }
    messages.push(
      { role: "assistant", content },
      { role: "user", content: `That JSON did not match the required format (${lastErr}). Return only corrected JSON.` },
    );
  }
  throw new Error(`Groq returned invalid output: ${lastErr}`);
}

export function describeGroqError(e: unknown): string {
  if (e instanceof Groq.AuthenticationError) return "Groq rejected the API key; check GROQ_API_KEY";
  if (e instanceof Groq.RateLimitError) return "Groq rate limit reached; wait a minute or use fewer sources";
  if (e instanceof Groq.APIError) return `Groq API error ${e.status}: ${e.message}`;
  return (e as Error)?.message ?? String(e);
}
