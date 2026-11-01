import type { Source, StaleSignal } from "./types";

// Deterministic freshness checks. These do not depend on the AI at all, so a
// stale-information warning always points at a concrete date or cycle in the text.

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const MONTH_IDX: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

const DMY = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})[,.]?\\s+(20\\d{2})\\b`, "gi");
const MDY = new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`, "gi");
const NUMERIC = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/g;
const ISO = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
const CYCLE = /\b(20\d{2})\s*[-–\/]\s*(20)?(\d{2})\b/g;

export interface FoundDate {
  date: Date;
  start: number;
  end: number;
  raw: string;
}

export function findDates(text: string): FoundDate[] {
  const out: FoundDate[] = [];
  const push = (d: Date, m: RegExpMatchArray) => {
    if (!isNaN(d.getTime())) out.push({ date: d, start: m.index!, end: m.index! + m[0].length, raw: m[0] });
  };
  for (const m of text.matchAll(DMY)) push(new Date(+m[3], MONTH_IDX[m[2].slice(0, 3).toLowerCase()], +m[1]), m);
  for (const m of text.matchAll(MDY)) push(new Date(+m[3], MONTH_IDX[m[1].slice(0, 3).toLowerCase()], +m[2]), m);
  for (const m of text.matchAll(NUMERIC)) if (+m[2] <= 12) push(new Date(+m[3], +m[2] - 1, +m[1]), m);
  for (const m of text.matchAll(ISO)) push(new Date(+m[1], +m[2] - 1, +m[3]), m);
  return out.sort((a, b) => a.start - b.start);
}

/** Academic / financial cycle the user is most likely acting in (cycles start mid-year). */
export function currentCycleStart(now: Date): number {
  return now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
}

function monthsBetween(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function fmt(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const DEADLINE_WORDS = /deadline|last date|closing date|apply by|applications? (?:close|open)|until|on or before|due/i;

export function detectStale(sources: Source[], now = new Date()): StaleSignal[] {
  const signals: Omit<StaleSignal, "id">[] = [];
  const cycle = currentCycleStart(now);

  for (const s of sources) {
    const text = s.text;
    let hasAnyDate = false;

    // 1. Page date (meta / user-entered).
    if (s.date) {
      hasAnyDate = true;
      const d = new Date(s.date);
      const age = monthsBetween(d, now);
      if (age >= 12) {
        signals.push({
          sourceId: s.id,
          kind: "old-date",
          detail: `Page dated ${fmt(d)} (${age} months old${s.dateEvidence ? `, from ${s.dateEvidence}` : ""}). Details may have changed since.`,
          severity: age >= 18 ? "high" : "medium",
        });
      }
    }

    // 2. Academic / financial cycles like "2025-26" older than the current cycle.
    let newestCycle = -1;
    let newestCycleMatch: RegExpMatchArray | null = null;
    for (const m of text.matchAll(CYCLE)) {
      const y1 = +m[1];
      const y2 = +((m[2] ?? "20") + m[3]);
      if (y2 !== y1 + 1) continue; // only consecutive-year cycles
      hasAnyDate = true;
      if (y1 > newestCycle) {
        newestCycle = y1;
        newestCycleMatch = m;
      }
    }
    if (newestCycleMatch && newestCycle < cycle) {
      const m = newestCycleMatch;
      signals.push({
        sourceId: s.id,
        kind: "old-cycle",
        detail: `Latest cycle mentioned is "${m[0]}", but the current cycle is ${cycle}-${String(cycle + 1).slice(2)}. This page may describe a previous year.`,
        quote: excerpt(text, m.index!, m.index! + m[0].length),
        span: [m.index!, m.index! + m[0].length],
        severity: "high",
      });
    }

    // 3. Deadlines that are already in the past.
    const dates = findDates(text);
    if (dates.length) hasAnyDate = true;
    for (const d of dates) {
      const ctx = text.slice(Math.max(0, d.start - 90), d.end + 20);
      if (DEADLINE_WORDS.test(ctx) && d.date < now) {
        signals.push({
          sourceId: s.id,
          kind: "past-deadline",
          detail: `Mentions a deadline-like date (${fmt(d.date)}) that has already passed. Check whether a newer date exists.`,
          quote: excerpt(text, d.start, d.end),
          span: [d.start, d.end],
          severity: "medium",
        });
        break; // one per source is enough
      }
    }

    // 4. Nothing date-like at all.
    if (!hasAnyDate) {
      signals.push({
        sourceId: s.id,
        kind: "undated",
        detail: "No publication date or cycle year found. Freshness cannot be confirmed.",
        severity: "low",
      });
    }
  }
  return signals.map((s, i) => ({ ...s, id: `D${i + 1}` }));
}

export function excerpt(text: string, start: number, end: number, pad = 70): string {
  const a = Math.max(0, text.lastIndexOf(" ", Math.max(0, start - pad)) + 1);
  const bIdx = text.indexOf(" ", Math.min(text.length, end + pad));
  const b = bIdx < 0 ? text.length : bIdx;
  return (a > 0 ? "…" : "") + text.slice(a, b).replace(/\s+/g, " ").trim() + (b < text.length ? "…" : "");
}
