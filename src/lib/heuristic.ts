import type { Aspect, Claim, Conflict, Source } from "./types";
import { findDates } from "./dates";

// Keyword-based engine. It runs with no API key, and it also runs alongside
// the AI to catch number and date mismatches the model might miss.

const NEEDS_DATE = new Set(["deadline", "dates"]);
const NEEDS_NUMBER = new Set(["income", "amount", "fees", "cost", "compensation", "benefit"]);
const HAS_NUMBER = /\d/;

// Sentence ends at newline or [.!?]+space, except after abbreviations like "Rs." or "No."
const ABBREV = /(?:^|[\s(])(?:rs|no|dr|mr|mrs|ms|st|vs|sr|jr|govt|dept|approx|e\.g|i\.e|etc)$/i;

export function sentences(text: string): { s: string; start: number }[] {
  const out: { s: string; start: number }[] = [];
  let start = 0;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const s = raw.trim();
    if (s.length >= 25 && s.length <= 450) out.push({ s, start: start + raw.indexOf(s) });
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") push(i + 1);
    else if ((ch === "." || ch === "!" || ch === "?") && /\s/.test(text[i + 1] ?? " ")) {
      if (ch === "." && ABBREV.test(text.slice(Math.max(start, i - 8), i))) continue;
      push(i + 1);
    }
  }
  push(text.length);
  return out;
}

export function heuristicClaims(sources: Source[], aspects: Aspect[], startId = 1): Claim[] {
  const claims: Claim[] = [];
  let n = startId;
  for (const src of sources) {
    const sents = sentences(src.text);
    for (const a of aspects) {
      const scored = sents
        .map((x) => {
          const low = x.s.toLowerCase();
          const hits = a.keywords.filter((k) => low.includes(k)).length;
          return { ...x, hits };
        })
        .filter((x) => x.hits > 0)
        .filter((x) => !NEEDS_DATE.has(a.id) || findDates(x.s).length > 0)
        .filter((x) => !NEEDS_NUMBER.has(a.id) || HAS_NUMBER.test(x.s))
        .filter((x) => a.id === "income" || !NEEDS_NUMBER.has(a.id) || !/\bincome\b/i.test(x.s))
        .sort((p, q) => q.hits - p.hits)
        .slice(0, 2);
      for (const x of scored) {
        claims.push({
          id: `C${n++}`,
          aspectId: a.id,
          sourceId: src.id,
          statement: x.s,
          quote: x.s,
          verified: true,
          matchScore: 1,
          span: [x.start, x.start + x.s.length],
          origin: "heuristic",
        });
      }
    }
  }
  return claims;
}

// ---- value comparison -------------------------------------------------------

function moneyValues(s: string): number[] {
  const out: number[] = [];
  const re = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakh|lac|crore|k)?|([\d.]+)\s*(lakh|lac|crore)/gi;
  for (const m of s.matchAll(re)) {
    const num = parseFloat((m[1] ?? m[3]).replace(/,/g, ""));
    const unit = (m[2] ?? m[4] ?? "").toLowerCase();
    const mult = unit.startsWith("la") ? 1e5 : unit === "crore" ? 1e7 : unit === "k" ? 1e3 : 1;
    if (!isNaN(num)) out.push(Math.round(num * mult));
  }
  return out;
}

function dateValues(s: string): string[] {
  return findDates(s).map((d) => d.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }));
}

const DOC_TERMS = ["income certificate", "itr", "form 16", "salary slip", "aadhaar", "marksheet", "bank passbook", "caste certificate", "domicile", "photograph", "bonafide", "fee receipt", "pan card", "ration card", "disability certificate"];

function docTerms(s: string): string[] {
  const low = s.toLowerCase();
  return DOC_TERMS.filter((t) => new RegExp(`\\b${t}\\b`).test(low));
}

/** Flags aspects where sources state different amounts, dates or document lists. */
export function heuristicConflicts(claims: Claim[], aspects: Aspect[], skipAspects = new Set<string>(), startId = 1): Conflict[] {
  const conflicts: Conflict[] = [];
  let n = startId;
  for (const a of aspects) {
    if (skipAspects.has(a.id)) continue;
    const forAspect = claims.filter((c) => c.aspectId === a.id && c.verified);
    const bySource = new Map<string, Claim[]>();
    for (const c of forAspect) bySource.set(c.sourceId, [...(bySource.get(c.sourceId) ?? []), c]);
    if (bySource.size < 2) continue;

    const extractors: [string, (s: string) => (string | number)[]][] = [];
    if (NEEDS_NUMBER.has(a.id)) extractors.push(["amount", moneyValues]);
    if (NEEDS_DATE.has(a.id)) extractors.push(["date", dateValues]);
    if (a.id === "documents") extractors.push(["document list", docTerms]);

    for (const [label, fn] of extractors) {
      const sets = [...bySource.entries()]
        .map(([sid, cs]) => ({ sid, cs, vals: new Set(cs.flatMap((c) => fn(c.quote)).map(String)) }))
        .filter((x) => x.vals.size > 0);
      const differs = (A: Set<string>, B: Set<string>) =>
        label === "document list"
          ? [...A].some((v) => !B.has(v)) && [...B].some((v) => !A.has(v))
          : ![...A].some((v) => B.has(v));
      const involved = sets.filter((A) => sets.some((B) => B !== A && differs(A.vals, B.vals)));
      if (involved.length < 2) continue;
      // Group sources that state the same values: "S1, S4: 15 Dec 2026 · S2: 30 Nov 2025"
      const groups = new Map<string, string[]>();
      const pretty = (vals: Set<string>) =>
        [...vals].map((v) => (label === "amount" ? `₹${Number(v).toLocaleString("en-IN")}` : v)).join(", ");
      for (const x of involved) groups.set(pretty(x.vals), [...(groups.get(pretty(x.vals)) ?? []), x.sid]);
      conflicts.push({
        id: `X${n++}`,
        aspectId: a.id,
        summary: `Sources give different ${label}s for "${a.name}": ${[...groups].map(([v, sids]) => `${sids.join(", ")} ${sids.length > 1 ? "say" : "says"} ${v}`).join("; ")}.`,
        claimIds: involved.flatMap((x) => x.cs).filter((c) => fn(c.quote).length).map((c) => c.id),
        confidence: "possible",
        origin: "heuristic",
      });
    }
  }
  return conflicts;
}
