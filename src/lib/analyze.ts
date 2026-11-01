import { z } from "zod";
import type {
  Analysis, Aspect, AspectSummary, ChecklistItem, Claim, Conflict, CoverageState, EchoReport, Gap, Source, StaleSignal,
} from "./types";
import { detectDecisionType, templateAspects } from "./aspects";
import { detectStale } from "./dates";
import { heuristicClaims, heuristicConflicts } from "./heuristic";
import { EXTRACT_MODELS, GROQ_MODEL, describeGroqError, groqAvailable, groqJSON } from "./llm";
import { verifyQuote } from "./verify";
import { detectEchoes, familyOf } from "./echo";

export type Progress = (stage: string, detail?: string) => void;

const FOCUS_BUDGET = 7000; // max chars per source sent to the model (keeps Groq free-tier calls small)

// ---- AI steps ---------------------------------------------------------------

const PlanSchema = z.object({
  extraAspects: z
    .array(z.object({ name: z.string(), why: z.string(), importance: z.enum(["critical", "important", "useful"]), keywords: z.array(z.string()).default([]) }))
    .default([]),
  questionsToAsk: z.array(z.string()).default([]),
});

async function planAspects(question: string, base: Aspect[]) {
  const sys =
    "You help people find what is MISSING from their research before making a decision. " +
    "Respond with JSON only.";
  const user = `Research question: "${question}"

A checklist of things this person needs to know already exists:
${base.map((a) => `- ${a.name}`).join("\n")}

1. "extraAspects": up to 3 more things that are specific to THIS question and are not already in the list. Each needs: name (2-5 words), why (one sentence), importance ("critical" | "important" | "useful"), keywords (3-6 lowercase words that would appear in a text discussing it). Return [] if the list is already complete.
2. "questionsToAsk": 3-5 short questions the person should ask the official issuer that sources often fail to answer.

Return {"extraAspects": [...], "questionsToAsk": [...]}`;
  return groqJSON(sys, user, PlanSchema, 1200);
}

const TopicPlanSchema = z.object({
  topicLabel: z.string().default("General research"),
  aspects: z
    .array(z.object({ name: z.string(), why: z.string(), importance: z.enum(["critical", "important", "useful"]), keywords: z.array(z.string()).default([]) }))
    .default([]),
  questionsToAsk: z.array(z.string()).default([]),
});

/** For topics without a built-in template: the AI drafts the whole checklist. */
async function planTopic(question: string) {
  const sys =
    "You help people find what is MISSING from their research on any topic before they rely on it. " +
    "Respond with JSON only.";
  const user = `Research question or goal: "${question}"

1. "topicLabel": a 2-4 word label for the kind of research this is (e.g. "Software migration", "Health guidance", "Travel requirements", "Product purchase", "Historical claim").
2. "aspects": 7-9 distinct things the person asking needs to know to act on this COMPLETELY and safely. Write them for the person asking, in plain words (an everyday user, not an engineer, unless the question is technical), covering what a careful expert would check: the direct answer, conditions and exceptions, risks or safety, what has changed recently, costs or effort, what to do if something goes wrong (remedies, support, replacement, warranty or appeals), and how to verify. Include at least 3 "critical" ones. Each needs: name (2-5 words), why (one sentence), importance ("critical" | "important" | "useful"), keywords (5-8 lowercase words or short phrases likely to appear in a text that discusses it).
3. "questionsToAsk": 3-5 short questions to put to an authoritative source, which online sources often fail to answer.

Return {"topicLabel": "...", "aspects": [...], "questionsToAsk": [...]}`;
  return groqJSON(sys, user, TopicPlanSchema, 1800);
}

const ExtractSchema = z.object({
  claims: z
    .array(z.object({ aspectId: z.string(), statement: z.string(), quote: z.string() }))
    .default([]),
  sourceDate: z.string().nullable().optional(),
});

async function extractFromChunk(question: string, aspects: Aspect[], src: Source, chunk: string, models: string[]) {
  const sys =
    "You extract evidence from a single source document. Rules:\n" +
    "- Only report what the SOURCE TEXT explicitly says. Never use outside knowledge, never guess.\n" +
    "- \"quote\" must be copied word-for-word from the SOURCE TEXT (one contiguous passage, max 45 words). Do not paraphrase inside quote.\n" +
    "- \"statement\" is a short neutral restatement (max 25 words) of what the quote says.\n" +
    "- Go through EVERY aspect one by one and look for any sentence that addresses it, even briefly or in different words (e.g. 'hot places' addresses temperature).\n" +
    "- If an aspect is truly not mentioned, output nothing for it. Missing information is expected and useful.\n" +
    "- Up to 3 claims per aspect; one quote may support several aspects. Respond with JSON only.";
  const user = `Question being researched: "${question}"

Aspects (use the id exactly):
${aspects.map((a) => `- ${a.id}: ${a.name}`).join("\n")}

SOURCE ${src.id} - "${src.title}"
---
${chunk}
---

Return {"claims": [{"aspectId": "...", "statement": "...", "quote": "..."}], "sourceDate": "YYYY-MM-DD or null (publication/update date stated in the text, if any)"}`;
  return groqJSON(sys, user, ExtractSchema, 1800, models);
}

const SynthSchema = z.object({
  conflicts: z
    .array(z.object({ aspectId: z.string(), claimIds: z.array(z.string()), summary: z.string(), confidence: z.enum(["likely", "possible"]).default("possible") }))
    .default([]),
  summary: z.array(z.object({ aspectId: z.string(), text: z.string(), claimIds: z.array(z.string()).default([]) })).default([]),
});

async function synthesize(question: string, aspects: Aspect[], claims: Claim[], sources: Source[]) {
  const srcLine = (id: string) => {
    const s = sources.find((x) => x.id === id)!;
    return `${id}${s.official ? " (official)" : ""}${s.date ? `, dated ${s.date}` : ""}`;
  };
  const blocks = aspects
    .map((a) => {
      const cs = claims.filter((c) => c.aspectId === a.id);
      if (!cs.length) return null;
      return `## ${a.id}: ${a.name}\n${cs.map((c) => `${c.id} [${srcLine(c.sourceId)}]: ${c.statement} | quote: "${c.quote}"`).join("\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const sys =
    "You compare evidence from multiple sources. Be careful and conservative. Respond with JSON only.";
  const user = `Question: "${question}"

Verified claims grouped by aspect:
${blocks}

Tasks:
1. "conflicts": cases where claims from DIFFERENT sources are incompatible (different amounts, dates, limits, document lists, conditions, or one says yes and another no). Do NOT flag claims that merely add detail or are compatible. Each conflict: aspectId, claimIds (from at least 2 different sources), summary (one sentence naming the sources, e.g. "S1 says X while S2 says Y"), confidence ("likely" if clearly incompatible, "possible" if it could be explained by different years or contexts).
2. "summary": for each aspect that has claims, one or two sentences summarising what the sources say, citing claim ids in claimIds. Mention disagreement if any. Do not add facts that are not in the claims.

Return {"conflicts": [...], "summary": [...]}`;
  return groqJSON(sys, user, SynthSchema, 2200);
}

// ---- deterministic steps ----------------------------------------------------

/** Citations are rendered as chips, so drop inline "(C1, C8)" markers from AI text. */
function stripClaimIds(s: string) {
  return s.replace(/\s*[([]\s*C\d+(?:\s*[,;]\s*C\d+)*\s*[)\]]/g, "").trim();
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "aspect";
}

function buildCoverage(aspects: Aspect[], sources: Source[], claims: Claim[], conflicts: Conflict[]) {
  const conflictClaim = new Set(conflicts.flatMap((x) => x.claimIds));
  const cov: Record<string, Record<string, CoverageState>> = {};
  for (const a of aspects) {
    cov[a.id] = {};
    for (const s of sources) {
      const cs = claims.filter((c) => c.aspectId === a.id && c.sourceId === s.id);
      let st: CoverageState = "missing";
      if (cs.some((c) => conflictClaim.has(c.id))) st = "conflict";
      else if (cs.some((c) => c.verified)) st = "covered";
      else if (cs.length) st = "unverified";
      cov[a.id][s.id] = st;
    }
  }
  return cov;
}

const SEV = { critical: "high", important: "medium", useful: "low" } as const;

function buildGaps(aspects: Aspect[], sources: Source[], claims: Claim[], echo: EchoReport): Gap[] {
  const gaps: Omit<Gap, "id">[] = [];
  const officialIds = new Set(sources.filter((s) => s.official).map((s) => s.id));
  const fam = familyOf(echo);
  for (const a of aspects) {
    const cs = claims.filter((c) => c.aspectId === a.id);
    const verified = cs.filter((c) => c.verified);
    const coveringSrcs = [...new Set(verified.map((c) => c.sourceId))];
    const coveringFams = new Set(coveringSrcs.map((id) => fam.get(id)));
    if (!cs.length) {
      gaps.push({
        aspectId: a.id,
        kind: "missing",
        title: `${a.name}: not found`,
        explanation: `None of the ${sources.length} sources reviewed mention this. ${a.why}`,
        severity: SEV[a.importance],
      });
    } else if (!verified.length) {
      gaps.push({
        aspectId: a.id,
        kind: "unverified-only",
        title: `${a.name}: evidence could not be verified`,
        explanation: "The AI reported something here, but its quote could not be found in the source text. Treat it as unconfirmed.",
        severity: a.importance === "useful" ? "low" : "medium",
      });
    } else if (coveringSrcs.length >= 2 && coveringFams.size === 1 && !coveringSrcs.some((id) => officialIds.has(id))) {
      gaps.push({
        aspectId: a.id,
        kind: "echo-only",
        title: `${a.name}: looks confirmed, but only one independent source`,
        explanation: `${coveringSrcs.join(" and ")} appear to agree, but they share copied text, so this is one source repeated rather than independent confirmation.`,
        severity: a.importance === "useful" ? "low" : "medium",
      });
    } else if (a.importance !== "useful" && !verified.some((c) => officialIds.has(c.sourceId))) {
      const srcs = [...new Set(verified.map((c) => c.sourceId))].join(", ");
      gaps.push({
        aspectId: a.id,
        kind: "unofficial-only",
        title: `${a.name}: only unofficial sources`,
        explanation: `Covered only by ${srcs}, ${officialIds.size ? "not by the official source(s)" : "and no official source was included"}. Secondary sites are often outdated or simplified.`,
        severity: a.importance === "critical" ? "medium" : "low",
      });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  return gaps.sort((x, y) => order[x.severity] - order[y.severity]).map((g, i) => ({ ...g, id: `G${i + 1}` }));
}

function readiness(aspects: Aspect[], sources: Source[], cov: Analysis["coverage"], claims: Claim[], stale: StaleSignal[]) {
  const W = { critical: 3, important: 2, useful: 1 };
  const officialIds = new Set(sources.filter((s) => s.official).map((s) => s.id));
  let total = 0, got = 0;
  const lines: string[] = [];
  for (const a of aspects) {
    total += W[a.importance];
    const states = Object.values(cov[a.id]);
    const verified = claims.filter((c) => c.aspectId === a.id && c.verified);
    let pts = 0;
    if (states.includes("conflict")) pts = 0.3;
    else if (verified.some((c) => officialIds.has(c.sourceId))) pts = 1;
    else if (verified.length) pts = 0.6;
    else if (states.includes("unverified")) pts = 0.2;
    got += pts * W[a.importance];
  }
  let score = total ? (got / total) * 100 : 0;
  const highStale = stale.filter((s) => s.severity === "high").length;
  if (highStale) {
    score *= Math.max(0.8, 1 - 0.05 * highStale);
    lines.push(`−${Math.round(Math.min(20, 5 * highStale))}% for ${highStale} high-severity freshness warning(s)`);
  }
  lines.unshift(
    "Official + verified + no conflict = full credit; unofficial only = 60%; conflicting = 30%; unverified = 20%; missing = 0.",
    "Weighted by importance: critical ×3, important ×2, useful ×1.",
  );
  return { score: Math.round(score), breakdown: lines };
}

function buildChecklist(aspects: Aspect[], sources: Source[], gaps: Gap[], conflicts: Conflict[], stale: StaleSignal[], echo: EchoReport): ChecklistItem[] {
  const A = (id: string) => aspects.find((a) => a.id === id)!;
  const official = sources.filter((s) => s.official);
  const where = official.length
    ? `Official source: ${official.map((s) => `${s.id} (${s.title})`).join(", ")}, or the responsible organisation directly`
    : "An official or primary source (the organisation responsible for this information); none was among those reviewed";
  const items: Omit<ChecklistItem, "id">[] = [];

  for (const x of conflicts) {
    const a = A(x.aspectId);
    items.push({
      priority: a.importance === "critical" ? "P1" : "P2",
      task: `Confirm the correct ${a.name.toLowerCase()}. Sources disagree.`,
      reason: x.summary,
      refs: [x.id, ...x.claimIds],
      verifyWhere: where,
    });
  }
  for (const g of gaps) {
    const a = A(g.aspectId);
    const pr = g.kind === "missing" ? ({ critical: "P1", important: "P2", useful: "P3" } as const)[a.importance] : g.severity === "medium" ? "P2" : "P3";
    const task =
      g.kind === "missing" ? `Find out the ${a.name.toLowerCase()}.`
      : g.kind === "unverified-only" ? `Double-check the ${a.name.toLowerCase()}. The extracted evidence is unconfirmed.`
      : g.kind === "echo-only" ? `Find an independent confirmation of the ${a.name.toLowerCase()}.`
      : `Confirm the ${a.name.toLowerCase()} on an official source.`;
    items.push({ priority: pr, task, reason: g.explanation, refs: [g.id], verifyWhere: where });
  }
  for (const f of echo.families.filter((f) => f.sourceIds.length > 1)) {
    const copies = f.sourceIds.filter((id) => id !== f.origin);
    items.push({
      priority: "P3",
      task: `Count ${f.sourceIds.join(", ")} as one source, not ${f.sourceIds.length}.`,
      reason: `${copies.join(", ")} share${copies.length === 1 ? "s" : ""} copied text with ${f.origin} (likely origin: ${f.originReason}). Agreement between them is not independent confirmation.`,
      refs: [f.id],
      verifyWhere: "Look for a second source that wrote its own account, ideally an official or primary one",
    });
  }
  for (const s of sources) {
    const ds = stale.filter((d) => d.sourceId === s.id && d.severity !== "low");
    if (!ds.length) continue;
    items.push({
      priority: ds.some((d) => d.severity === "high") ? "P2" : "P3",
      task: `Check whether "${s.title}" (${s.id}) is still current before relying on it.`,
      reason: ds.map((d) => d.detail).join(" "),
      refs: ds.map((d) => d.id),
      verifyWhere: where,
    });
  }
  const order = { P1: 0, P2: 1, P3: 2 };
  return items.sort((a, b) => order[a.priority] - order[b.priority]).map((x, i) => ({ ...x, id: `V${i + 1}` }));
}

function fallbackSummary(aspects: Aspect[], claims: Claim[]): AspectSummary[] {
  return aspects
    .map((a) => {
      const cs = claims.filter((c) => c.aspectId === a.id && c.verified);
      if (!cs.length) return null;
      const srcs = [...new Set(cs.map((c) => c.sourceId))];
      const first = cs[0].statement.length > 220 ? cs[0].statement.slice(0, 217) + "…" : cs[0].statement;
      return { aspectId: a.id, text: `Mentioned in ${srcs.join(", ")}. e.g. "${first}"`, claimIds: cs.slice(0, 4).map((c) => c.id) };
    })
    .filter(Boolean) as AspectSummary[];
}

/**
 * Long pages are cut down to the passages most relevant to the checklist before
 * they go to the model (keeps Groq calls small and fast). Quotes are still
 * verified against the full page.
 */
function focusText(text: string, aspects: Aspect[], question: string): { text: string; partial: boolean; share: number } {
  if (text.length <= FOCUS_BUDGET) return { text, partial: false, share: 1 };
  const terms = [
    ...new Set([...aspects.flatMap((a) => a.keywords), ...question.toLowerCase().split(/\W+/).filter((w) => w.length > 4)].map((k) => k.toLowerCase())),
  ];
  const paras = text.split("\n").map((p, i) => {
    const low = p.toLowerCase();
    const hits = terms.reduce((n, t) => n + (low.includes(t) ? 1 : 0), 0);
    return { p, i, score: i < 3 ? 1000 : hits / Math.sqrt(Math.max(1, p.length / 200)) };
  });
  const picked: typeof paras = [];
  let used = 0;
  for (const x of [...paras].sort((a, b) => b.score - a.score)) {
    if (x.score <= 0) break;
    if (used + x.p.length + 1 > FOCUS_BUDGET) continue;
    picked.push(x);
    used += x.p.length + 1;
  }
  const out = picked.sort((a, b) => a.i - b.i).map((x) => x.p).join("\n");
  return { text: out, partial: true, share: out.length / text.length };
}

/** Run async jobs with a fixed number in flight. */
async function pool<T>(items: T[], size: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

// ---- orchestrator -------------------------------------------------------------

export async function analyze(question: string, sources: Source[], progress: Progress = () => {}): Promise<Analysis> {
  const warnings: string[] = [];
  const useAI = groqAvailable();
  const corpus = sources.map((s) => s.text).join("\n");
  let decisionType = detectDecisionType(question, corpus);
  let aspects = templateAspects(decisionType);
  let aiSuggestions: string[] = [];
  let claims: Claim[] = [];
  let conflicts: Conflict[] = [];
  let summary: AspectSummary[] = [];
  let engine: Analysis["engine"] = useAI ? "groq" : "heuristic";

  progress("plan", decisionType === "general" ? "Working out what this topic needs" : `Decision type: ${decisionType}. Building the checklist of what this decision needs`);
  let planned = false;
  if (useAI && decisionType === "general") {
    try {
      const plan = await planTopic(question);
      if (plan.aspects.length >= 5) {
        const ids = new Set<string>();
        aspects = plan.aspects.slice(0, 10).map((x) => {
          let id = slug(x.name);
          while (ids.has(id)) id += "-x";
          ids.add(id);
          return { id, name: x.name, why: x.why, importance: x.importance, keywords: x.keywords.map((k) => k.toLowerCase()), origin: "ai" as const };
        });
        decisionType = plan.topicLabel.trim().slice(0, 40) || "General research";
        aiSuggestions = plan.questionsToAsk.slice(0, 6);
        planned = true;
      }
    } catch (e) {
      warnings.push(`AI topic planning failed (${describeGroqError(e)}). Using the general checklist.`);
    }
  }
  if (useAI && !planned) {
    try {
      const plan = await planAspects(question, aspects);
      const existing = new Set(aspects.map((a) => a.id));
      for (const x of plan.extraAspects.slice(0, 3)) {
        let id = slug(x.name);
        while (existing.has(id)) id += "-x";
        existing.add(id);
        aspects.push({ id, name: x.name, why: x.why, importance: x.importance, keywords: x.keywords.map((k) => k.toLowerCase()), origin: "ai" });
      }
      aiSuggestions = plan.questionsToAsk.slice(0, 6);
    } catch (e) {
      warnings.push(`AI planning step failed (${describeGroqError(e)}). Using the built-in checklist only.`);
    }
  }

  // Extraction
  if (useAI) {
    let failed = 0;
    let doneCount = 0;
    const perSource: Omit<Claim, "id">[][] = sources.map(() => []);
    progress("extract", `Reading ${sources.length} sources in parallel`);
    await pool(sources, EXTRACT_MODELS.length * 2, async (src, i) => {
      const focus = focusText(src.text, aspects, question);
      if (focus.partial) warnings.push(`${src.id} is long; the AI read its ${Math.round(focus.share * 100)}% most relevant passages (quotes are still checked against the full page).`);
      try {
        // strongest model first; the others only take over when it is rate-limited
        const out = await extractFromChunk(question, aspects, src, focus.text, EXTRACT_MODELS);
        for (const c of out.claims) {
          if (!aspects.some((a) => a.id === c.aspectId)) continue;
          const m = verifyQuote(src.text, c.quote);
          perSource[i].push({ aspectId: c.aspectId, sourceId: src.id, statement: c.statement, quote: c.quote, verified: m.verified, matchScore: m.score, span: m.span, origin: "ai" });
        }
        if (!src.date && out.sourceDate && /^\d{4}-\d{2}-\d{2}$/.test(out.sourceDate)) {
          const m = verifyQuote(src.text, out.sourceDate);
          src.date = out.sourceDate;
          src.dateEvidence = m.verified ? "date stated in text" : "date inferred by AI (unverified)";
        }
      } catch (e) {
        failed++;
        warnings.push(`AI extraction failed for ${src.id} (${describeGroqError(e)}). Keyword matching was used instead.`);
        perSource[i].push(...heuristicClaims([src], aspects).map(({ id: _id, ...c }) => c));
      }
      progress("extract", `Read ${++doneCount} of ${sources.length} sources`);
    });
    claims = perSource.flat().map((c, k) => ({ ...c, id: `C${k + 1}` }));
    if (failed === sources.length) engine = "heuristic";
  } else {
    progress("extract", "No GROQ_API_KEY set. Using keyword-based evidence extraction");
    claims = heuristicClaims(sources, aspects);
  }

  // Dedupe near-identical claims per source/aspect
  const seen = new Set<string>();
  claims = claims.filter((c) => {
    const k = `${c.sourceId}|${c.aspectId}|${c.span?.[0] ?? c.quote.slice(0, 40)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Conflicts + summary
  progress("compare", "Comparing sources for contradictions");
  const verified = claims.filter((c) => c.verified);
  if (engine === "groq" && verified.length) {
    try {
      const out = await synthesize(question, aspects, verified, sources);
      const byId = new Map(claims.map((c) => [c.id, c]));
      let k = 1;
      for (const x of out.conflicts) {
        const ids = x.claimIds.filter((id) => byId.has(id) && byId.get(id)!.aspectId === x.aspectId);
        const srcCount = new Set(ids.map((id) => byId.get(id)!.sourceId)).size;
        if (srcCount < 2 || !aspects.some((a) => a.id === x.aspectId)) continue; // reject unsupported conflicts
        conflicts.push({ id: `X${k++}`, aspectId: x.aspectId, claimIds: ids, summary: stripClaimIds(x.summary), confidence: x.confidence, origin: "ai" });
      }
      summary = out.summary
        .filter((s) => aspects.some((a) => a.id === s.aspectId))
        .map((s) => ({
          ...s,
          text: stripClaimIds(s.text),
          claimIds: s.claimIds.filter((id) => byId.has(id)),
        }));
    } catch (e) {
      warnings.push(`AI comparison step failed (${describeGroqError(e)}). Using rule-based comparison only.`);
    }
  }
  const flagged = new Set(conflicts.map((c) => c.aspectId));
  conflicts.push(...heuristicConflicts(claims, aspects, flagged, conflicts.length + 1));
  if (!summary.length) summary = fallbackSummary(aspects, claims);

  progress("echo", "Checking which sources copy each other");
  const echo = detectEchoes(sources);

  progress("freshness", "Checking dates and cycles");
  const stale = detectStale(sources);

  progress("gaps", "Finding gaps and building the checklist");
  const coverage = buildCoverage(aspects, sources, claims, conflicts);
  const gaps = buildGaps(aspects, sources, claims, echo);
  const checklist = buildChecklist(aspects, sources, gaps, conflicts, stale, echo);
  if (!sources.some((s) => s.official)) warnings.push("No source is marked official. Every finding depends on secondary sources.");

  return {
    question,
    decisionType,
    engine,
    model: engine === "groq" ? GROQ_MODEL : undefined,
    generatedAt: new Date().toISOString(),
    aspects,
    sources,
    claims,
    coverage,
    gaps,
    conflicts,
    stale,
    echo,
    summary,
    checklist,
    readiness: readiness(aspects, sources, coverage, claims, stale),
    aiSuggestions,
    warnings,
  };
}
