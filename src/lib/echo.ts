import type { EchoFamily, EchoLink, EchoReport, Source } from "./types";

// Echo detection: finds sources that share copied text. Content farms and
// aggregators often rewrite one original article, so "four sites agree" can
// really be one claim repeated. We compare 8-word shingles between every pair
// of sources, group sources that copy each other into families, and count
// families (not pages) as independent sources.

const K = 8; // words per shingle
const MIN_RUN = 25; // a shared passage of this many words is copying, not coincidence
const MIN_OVERLAP = 0.15; // or this share of the shorter text

interface Tok {
  w: string;
  start: number;
  end: number;
}

function words(text: string): Tok[] {
  const out: Tok[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) out.push({ w: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length });
  return out;
}

function shingleIndex(toks: Tok[]): Map<string, number[]> {
  const idx = new Map<string, number[]>();
  for (let i = 0; i + K <= toks.length; i++) {
    const key = toks.slice(i, i + K).map((t) => t.w).join(" ");
    const arr = idx.get(key);
    if (arr) arr.push(i);
    else idx.set(key, [i]);
  }
  return idx;
}

function compare(a: Source, ta: Tok[], b: Source, tb: Tok[], ib: Map<string, number[]>): EchoLink | null {
  const na = Math.max(0, ta.length - K + 1);
  const nb = Math.max(0, tb.length - K + 1);
  if (!na || !nb) return null;

  let shared = 0;
  let bestLen = 0;
  let bestA = -1;
  let bestB = -1;
  let runStart = -1;
  let runB = -1;
  for (let i = 0; i < na; i++) {
    const key = ta.slice(i, i + K).map((t) => t.w).join(" ");
    const hits = ib.get(key);
    if (hits) {
      shared++;
      if (runStart < 0) {
        runStart = i;
        runB = hits[0];
      }
      const len = i - runStart + K;
      if (len > bestLen) {
        bestLen = len;
        bestA = runStart;
        bestB = runB;
      }
    } else {
      runStart = -1;
    }
  }
  const overlap = shared / Math.min(na, nb);
  if (bestLen < MIN_RUN && overlap < MIN_OVERLAP) return null;

  const spanA: [number, number] = [ta[bestA].start, ta[Math.min(ta.length - 1, bestA + bestLen - 1)].end];
  const spanB: [number, number] = [tb[bestB].start, tb[Math.min(tb.length - 1, bestB + bestLen - 1)].end];
  const passage = a.text.slice(spanA[0], spanA[1]).replace(/\s+/g, " ");
  return {
    a: a.id,
    b: b.id,
    overlap: Math.round(overlap * 100) / 100,
    sharedWords: bestLen,
    example: passage.length > 320 ? passage.slice(0, 317) + "…" : passage,
    spanA,
    spanB,
  };
}

export function detectEchoes(sources: Source[]): EchoReport {
  const toks = sources.map((s) => words(s.text));
  const idx = toks.map(shingleIndex);
  const links: EchoLink[] = [];
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const l = compare(sources[i], toks[i], sources[j], toks[j], idx[j]);
      if (l) links.push(l);
    }
  }

  // Union-find into families of sources that share copied text.
  const parent = new Map(sources.map((s) => [s.id, s.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const l of links) parent.set(find(l.a), find(l.b));
  const groups = new Map<string, string[]>();
  for (const s of sources) groups.set(find(s.id), [...(groups.get(find(s.id)) ?? []), s.id]);

  const families: EchoFamily[] = [];
  let n = 1;
  for (const ids of groups.values()) {
    const members = sources.filter((s) => ids.includes(s.id));
    let origin = members[0];
    let originReason = "only page in this group";
    if (members.length > 1) {
      const official = members.find((s) => s.official);
      const dated = members.filter((s) => s.date).sort((x, y) => x.date!.localeCompare(y.date!));
      if (official) {
        origin = official;
        originReason = "official source";
      } else if (dated.length) {
        origin = dated[0];
        originReason = `earliest dated (${dated[0].date})`;
      } else {
        // the page the others overlap with most
        const score = (id: string) => links.filter((l) => l.a === id || l.b === id).reduce((t, l) => t + l.overlap, 0);
        origin = members.reduce((best, s) => (score(s.id) > score(best.id) ? s : best), members[0]);
        originReason = "most shared text; no dates available";
      }
    }
    families.push({ id: `F${n++}`, sourceIds: members.map((s) => s.id), origin: origin.id, originReason });
  }
  families.sort((x, y) => y.sourceIds.length - x.sourceIds.length);
  families.forEach((f, i) => (f.id = `F${i + 1}`));

  return { links, families, independentCount: families.length };
}

/** Family id for each source id. */
export function familyOf(report: EchoReport): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of report.families) for (const id of f.sourceIds) m.set(id, f.id);
  return m;
}
