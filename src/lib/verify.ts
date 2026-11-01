// Quote verification: every AI claim must carry a quote, and we check that the
// quote really exists in the source text. Claims whose quotes cannot be found
// are kept but marked unverified, so hallucinated evidence is never shown as fact.

const CHAR_MAP: Record<string, string> = {
  "‘": "'", "’": "'", "“": '"', "”": '"',
  "–": "-", "—": "-", " ": " ",
};

/** Lowercase + unify quotes/dashes + collapse whitespace, keeping an index map back to the original. */
function normalizeWithMap(s: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < s.length; i++) {
    let ch = CHAR_MAP[s[i]] ?? s[i];
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      ch = " ";
      lastSpace = true;
    } else {
      lastSpace = false;
    }
    norm += ch.toLowerCase();
    map.push(i);
  }
  return { norm, map };
}

const TOKEN = /[\p{L}\p{N}₹$%]+/gu;

function tokens(s: string): { t: string; start: number; end: number }[] {
  const out: { t: string; start: number; end: number }[] = [];
  for (const m of s.matchAll(TOKEN)) {
    out.push({ t: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

export interface QuoteMatch {
  verified: boolean;
  score: number;
  span?: [number, number];
}

export function verifyQuote(text: string, quote: string): QuoteMatch {
  const whole = quote.split(/\s*(?:\.{3}|…)\s*/).length === 1 ? verifyOne(text, quote) : null;
  if (whole?.verified) return whole;
  // Quotes sometimes stitch passages together ("A ... B", or skip a sentence):
  // accept only if every piece/sentence is found verbatim, in order.
  const pieces = quote
    .split(/\s*(?:\.{3}|…)\s*/)
    .flatMap((p) => p.split(/(?<=[.!?])\s+/))
    .map((p) => p.trim())
    .filter((p) => p.length >= 8);
  if (pieces.length > 1) {
    // pieces must match exactly (score 1), not fuzzily
    const ms = pieces.map((p) => {
      const m = verifyOne(text, p);
      return { ...m, verified: m.verified && m.score === 1 };
    });
    const ordered = ms.every((m, i) => i === 0 || (m.span && ms[i - 1].span && m.span[0] >= ms[i - 1].span![0]));
    const ok = ms.every((m) => m.verified) && ordered;
    const first = ms[0].span, last = ms[ms.length - 1].span;
    return {
      verified: ok,
      score: Math.min(...ms.map((m) => m.score)),
      span: first && last && ordered ? [first[0], last[1]] : first,
    };
  }
  return whole ?? verifyOne(text, quote);
}

function verifyOne(text: string, quote: string): QuoteMatch {
  const q = quote.trim().replace(/^["'“”]+|["'“”.…]+$/g, "");
  if (q.length < 8) return { verified: false, score: 0 };

  // 1. Exact match after normalisation.
  const src = normalizeWithMap(text);
  const nq = normalizeWithMap(q).norm;
  const idx = src.norm.indexOf(nq);
  if (idx >= 0) {
    const start = src.map[idx];
    const end = src.map[idx + nq.length - 1] + 1;
    return { verified: true, score: 1, span: [start, end] };
  }

  // 2. Fuzzy: best window of source tokens covering the quote's tokens
  //    (tolerates small paraphrases, dropped punctuation, ellipses).
  const qt = tokens(q).map((x) => x.t);
  if (qt.length < 3) return { verified: false, score: 0 };
  const st = tokens(text);
  const qset = new Map<string, number>();
  for (const t of qt) qset.set(t, (qset.get(t) ?? 0) + 1);

  const n = qt.length;
  let best = 0;
  let bestStart = -1;
  for (let i = 0; i + 1 <= st.length; i++) {
    if (!qset.has(st[i].t)) continue; // windows start on a quote token
    const remaining = new Map(qset);
    let hit = 0;
    for (let j = i; j < Math.min(st.length, i + n + 3); j++) {
      const c = remaining.get(st[j].t);
      if (c) {
        hit++;
        remaining.set(st[j].t, c - 1);
      }
    }
    const score = hit / n;
    if (score > best) {
      best = score;
      bestStart = i;
    }
  }
  if (bestStart < 0) return { verified: false, score: 0 };
  const endTok = st[Math.min(st.length - 1, bestStart + n - 1)];
  const span: [number, number] = [st[bestStart].start, endTok.end];
  return { verified: best >= 0.8, score: Math.round(best * 100) / 100, span };
}
