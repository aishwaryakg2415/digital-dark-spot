"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Analysis, Claim, CoverageState, Source } from "@/lib/types";
import { decisionLabel } from "@/lib/aspects";

type Tab = "findings" | "coverage" | "gaps" | "conflicts" | "echoes" | "freshness" | "checklist";
type Evidence = { sourceId: string; span?: [number, number]; label: string };

const IMP_DOT = { critical: "bg-red", important: "bg-orange", useful: "bg-slate-300" };
const SEV_ACCENT = { high: "#e63946", medium: "#f08c00", low: "#8a8a94" };
const SEV_CHIP = { high: "bg-rose text-red", medium: "bg-peach text-amber-700", low: "bg-slate-100 text-slate-600" };
const CELL: Record<CoverageState, string> = {
  covered: "bg-mint text-green",
  conflict: "bg-rose text-red",
  unverified: "bg-peach text-amber-700",
  missing: "bg-slate-50 text-slate-300 border border-dashed border-slate-200",
};
const CELL_LABEL: Record<CoverageState, string> = { covered: "✓", conflict: "≠", unverified: "?", missing: "–" };

export default function Results({ analysis: a }: { analysis: Analysis }) {
  const [tab, setTab] = useState<Tab>("findings");
  const [ev, setEv] = useState<Evidence | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const claimById = useMemo(() => new Map(a.claims.map((c) => [c.id, c])), [a]);
  const src = (id: string) => a.sources.find((s) => s.id === id)!;
  const aspect = (id: string) => a.aspects.find((x) => x.id === id);
  const verifiedCount = a.claims.filter((c) => c.verified).length;

  const openClaim = (c: Claim) => setEv({ sourceId: c.sourceId, span: c.span, label: `${c.id}: ${c.statement}` });

  const jump = (ref: string) => {
    const c = claimById.get(ref);
    if (c) return openClaim(c);
    const d = a.stale.find((x) => x.id === ref);
    if (d) return setEv({ sourceId: d.sourceId, span: d.span, label: `${d.id}: ${d.detail}` });
    const t: Record<string, Tab> = { G: "gaps", X: "conflicts", D: "freshness", F: "echoes" };
    if (t[ref[0]]) {
      setTab(t[ref[0]]);
      setTimeout(() => document.getElementById(ref)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    }
  };

  const Cite = ({ id }: { id: string }) => {
    const c = claimById.get(id);
    if (!c) return null;
    return (
      <button
        onClick={() => openClaim(c)}
        title={c.verified ? `Quote found in ${c.sourceId}` : `Quote NOT found in ${c.sourceId} (unverified)`}
        className={`chip font-mono mx-0.5 hover:brightness-95 transition ${c.verified ? "bg-mint text-green" : "bg-peach text-amber-700"}`}
      >
        {c.sourceId}
        <span>{c.verified ? "✓" : "?"}</span>
      </button>
    );
  };

  const tabs: [Tab, string, number?][] = [
    ["findings", "What sources say", a.summary.length],
    ["coverage", "Coverage map"],
    ["gaps", "Gaps", a.gaps.length],
    ["conflicts", "Conflicts", a.conflicts.length],
    ["echoes", "Source echoes", a.echo.links.length],
    ["freshness", "Freshness", a.stale.length],
    ["checklist", "Verify next", a.checklist.length],
  ];

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="grid gap-5 md:grid-cols-[auto_1fr]">
        <ScoreRing score={a.readiness.score} breakdown={a.readiness.breakdown} />
        <div className="card p-6 space-y-4">
          <div>
            <div className="eyebrow">Analysis · {decisionLabel(a.decisionType)}</div>
            <div className="mt-1 text-xl font-bold leading-snug tracking-tight">{a.question}</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <Stat label="Gaps" value={a.gaps.length} color="#e63946" onClick={() => setTab("gaps")} />
            <Stat label="Conflicts" value={a.conflicts.length} color="#e63946" onClick={() => setTab("conflicts")} />
            <Stat
              label="Independent sources"
              value={`${a.echo.independentCount}/${a.sources.length}`}
              color={a.echo.independentCount < a.sources.length ? "#7048e8" : "#2b8a5e"}
              onClick={() => setTab("echoes")}
            />
            <Stat label="Freshness warnings" value={a.stale.filter((s) => s.severity !== "low").length} color="#f08c00" onClick={() => setTab("freshness")} />
            <Stat label="Verified evidence" value={`${verifiedCount}/${a.claims.length}`} color="#2f9e44" onClick={() => setTab("coverage")} />
          </div>
          <Legend />
          <div className="text-xs text-muted">
            {a.engine === "groq" ? `Groq · ${a.model} for extraction & comparison, plus rule-based checks` : "Offline keyword engine + rule-based checks"} · {a.sources.length} sources ·{" "}
            {new Date(a.generatedAt).toLocaleString()}
          </div>
        </div>
      </div>

      {a.warnings.length > 0 && (
        <div className="card-sm accent bg-cream p-3.5 text-sm space-y-1" style={{ ["--accent" as string]: "#f08c00" }}>
          {a.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      <div className="card overflow-hidden">
        {/* Tabs */}
        <div className="no-print flex gap-1 overflow-x-auto scrollbar-thin border-b border-line px-3 bg-slate-50/60">
          {tabs.map(([k, label, n]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`whitespace-nowrap px-3.5 py-3.5 text-sm font-semibold border-b-2 -mb-px transition ${tab === k ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
            >
              {label}
              {n !== undefined && (
                <span className={`ml-2 rounded-full px-1.5 py-px text-[11px] ${tab === k ? "bg-brand text-white" : "bg-slate-200 text-slate-600"}`}>{n}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "findings" && (
            <div className="space-y-3">
              <Intro>
                Key information found across sources, grouped by what your decision needs. <Badge kind="ai">AI summary</Badge> text is generated; click a source chip to read
                the exact passage.
              </Intro>
              {a.aspects.map((asp) => {
                const s = a.summary.find((x) => x.aspectId === asp.id);
                const claims = a.claims.filter((c) => c.aspectId === asp.id);
                const states = Object.values(a.coverage[asp.id] ?? {});
                return (
                  <div key={asp.id} className="card-sm p-4 pop">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${IMP_DOT[asp.importance]}`} title={asp.importance} />
                      <span className="font-semibold">{asp.name}</span>
                      <span className="text-xs text-muted capitalize">{asp.importance}</span>
                      {asp.origin === "ai" && <Badge kind="ai">AI-suggested topic</Badge>}
                      {states.includes("conflict") && <Badge kind="gap">Sources disagree</Badge>}
                      {!claims.length && <Badge kind="gap">Not found in any source</Badge>}
                    </div>
                    {s ? (
                      <p className="mt-2 text-[15px] leading-relaxed text-slate-700">
                        {a.engine === "groq" && <Badge kind="ai">AI summary</Badge>} {s.text}{" "}
                        {[...new Set([...s.claimIds, ...claims.map((c) => c.id)])].slice(0, 6).map((id) => <Cite key={id} id={id} />)}
                      </p>
                    ) : claims.length ? (
                      <p className="mt-2">{claims.map((c) => <Cite key={c.id} id={c.id} />)}</p>
                    ) : (
                      <p className="mt-2 text-sm text-muted">{asp.why}</p>
                    )}
                    {claims.length > 0 && (
                      <details className="mt-2 group">
                        <summary className="text-xs font-semibold text-brand cursor-pointer hover:underline list-none">
                          <span className="group-open:hidden">Show</span>
                          <span className="hidden group-open:inline">Hide</span> {claims.length} extracted quote{claims.length > 1 ? "s" : ""}
                        </summary>
                        <ul className="mt-2 space-y-1.5">
                          {claims.map((c) => (
                            <li key={c.id} className="flex gap-2 items-start rounded-lg bg-slate-50 p-2 text-sm">
                              <Cite id={c.id} />
                              <span className={c.verified ? "text-slate-700" : "italic text-muted"}>
                                &ldquo;{c.quote}&rdquo;
                                {!c.verified && <span className="not-italic text-xs font-semibold text-amber-700"> (quote not found in source: unverified)</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                );
              })}
              {a.aiSuggestions.length > 0 && (
                <div className="card-sm accent bg-lilac/40 p-4" style={{ ["--accent" as string]: "#7048e8" }}>
                  <div className="flex items-center gap-2 font-semibold">
                    Questions worth asking the issuer <Badge kind="ai">AI suggestion</Badge>
                  </div>
                  <ul className="mt-2 list-disc pl-5 text-[15px] text-slate-700 space-y-1">
                    {a.aiSuggestions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === "coverage" && (
            <div className="space-y-4">
              <Intro>Each row is something your decision needs; each column is a source. Click a cell to see the evidence.</Intro>
              <div className="overflow-x-auto scrollbar-thin rounded-xl border border-line">
                <table className="w-full border-separate border-spacing-1.5 text-sm">
                  <thead>
                    <tr>
                      <th className="text-left eyebrow px-2 py-1">Topic</th>
                      {a.sources.map((s) => (
                        <th key={s.id} className="px-1 min-w-[72px]" title={s.title}>
                          <button onClick={() => setEv({ sourceId: s.id, label: s.title })} className={`idtag hover:border-brand transition ${s.official ? "!bg-mint !text-green" : ""}`}>
                            {s.id}
                            {s.official && <span title="Official source">&nbsp;★</span>}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {a.aspects.map((asp) => (
                      <tr key={asp.id}>
                        <td className="px-2 py-1 whitespace-nowrap font-medium">
                          <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${IMP_DOT[asp.importance]}`} />
                          {asp.name}
                          {asp.origin === "ai" && <span className="chip bg-lilac text-purple ml-1.5">AI</span>}
                        </td>
                        {a.sources.map((s) => {
                          const st = a.coverage[asp.id]?.[s.id] ?? "missing";
                          const first = a.claims.find((c) => c.aspectId === asp.id && c.sourceId === s.id);
                          return (
                            <td key={s.id}>
                              <button
                                disabled={!first}
                                onClick={() => first && openClaim(first)}
                                className={`w-full h-9 rounded-lg font-bold ${CELL[st]} ${first ? "hover:ring-2 hover:ring-brand/40 transition" : "cursor-default"}`}
                                title={st}
                              >
                                {CELL_LABEL[st]}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
                {(Object.keys(CELL) as CoverageState[]).map((k) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className={`inline-grid place-items-center w-5 h-5 rounded-md font-bold ${CELL[k]}`}>{CELL_LABEL[k]}</span>
                    {k === "covered" ? "Covered (verified quote)" : k === "conflict" ? "Conflicts with another source" : k === "unverified" ? "AI claim, quote not verified" : "Not mentioned"}
                  </span>
                ))}
                <span>★ Official source</span>
              </div>
            </div>
          )}

          {tab === "gaps" && (
            <div className="space-y-3">
              <Intro>
                <Badge kind="rule">Rule-based</Badge> Topics your decision needs that the sources don&apos;t cover well. These are <b>potential</b> gaps in the sources reviewed,
                not proof the information doesn&apos;t exist.
              </Intro>
              {a.gaps.length === 0 && <Empty>No gaps found. Every checklist topic is covered by an official, verified source.</Empty>}
              {a.gaps.map((g) => (
                <div id={g.id} key={g.id} className="card-sm accent p-4 pop" style={{ ["--accent" as string]: SEV_ACCENT[g.severity] }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="idtag">{g.id}</span>
                    <span className="font-semibold">Potential gap: {g.title}</span>
                    <span className={`chip ml-auto uppercase ${SEV_CHIP[g.severity]}`}>{g.severity}</span>
                  </div>
                  <p className="mt-2 text-[15px] text-slate-700">{g.explanation}</p>
                  {g.kind !== "missing" && (
                    <div className="mt-2">{a.claims.filter((c) => c.aspectId === g.aspectId).map((c) => <Cite key={c.id} id={c.id} />)}</div>
                  )}
                  {g.kind === "missing" && (
                    <div className="mt-2 text-xs text-muted">
                      Searched {a.sources.map((s) => s.id).join(", ")} · looked for: {aspect(g.aspectId)?.keywords.slice(0, 6).join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === "conflicts" && (
            <div className="space-y-4">
              <Intro>Places where sources appear to disagree. Each side is shown with its exact quote. Check which one is current and official.</Intro>
              {a.conflicts.length === 0 && <Empty>No contradictions detected between sources.</Empty>}
              {a.conflicts.map((x) => {
                const cs = x.claimIds.map((id) => claimById.get(id)!).filter(Boolean);
                const bySrc = [...new Set(cs.map((c) => c.sourceId))];
                return (
                  <div id={x.id} key={x.id} className="card-sm accent p-4 pop" style={{ ["--accent" as string]: "#e63946" }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="idtag">{x.id}</span>
                      <span className="font-semibold">
                        {x.confidence === "likely" ? "Likely conflict" : "Possible conflict"}: {aspect(x.aspectId)?.name}
                      </span>
                      <Badge kind={x.origin === "ai" ? "ai" : "rule"}>{x.origin === "ai" ? "Detected by AI" : "Detected by value comparison"}</Badge>
                    </div>
                    <p className="mt-2 text-[15px] text-slate-700">{x.summary}</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {bySrc.map((sid) => {
                        const s = src(sid);
                        return (
                          <div key={sid} className="rounded-xl border border-line bg-slate-50/70 p-3 text-sm">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="idtag bg-white">{sid}</span>
                              <span className="truncate font-semibold text-slate-700">{s.title}</span>
                              {s.official && <Badge kind="sourced">Official</Badge>}
                              {s.date && <span className="ml-auto whitespace-nowrap text-muted">{s.date}</span>}
                            </div>
                            {cs.filter((c) => c.sourceId === sid).map((c) => (
                              <button key={c.id} onClick={() => openClaim(c)} className="mt-2 block w-full text-left rounded-lg bg-white border border-line hover:border-brand/50 p-2.5 transition">
                                &ldquo;{c.quote}&rdquo; <span className="text-xs font-semibold text-brand whitespace-nowrap">View in source →</span>
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "echoes" && (
            <div className="space-y-4">
              <Intro>
                <Badge kind="rule">Rule-based</Badge> Websites often copy each other. Pages that share copied passages are grouped into one family and count as{" "}
                <b>one</b> independent source, so repeated text can&apos;t pass for agreement.
              </Intro>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr] items-start">
                <div className="card-sm p-4 bg-brand-soft/40">
                  <EchoGraph a={a} />
                  <div className="mt-2 text-center">
                    <div className="font-display text-3xl font-extrabold">
                      {a.sources.length} pages → <span className={a.echo.independentCount < a.sources.length ? "text-purple" : "text-brand-dark"}>{a.echo.independentCount}</span>
                    </div>
                    <div className="text-sm text-muted font-semibold">independent source{a.echo.independentCount === 1 ? "" : "s"}</div>
                  </div>
                </div>
                <div className="space-y-3">
                  {a.echo.links.length === 0 && <Empty>No copied text found. Every source wrote its own account.</Empty>}
                  {a.echo.families
                    .filter((f) => f.sourceIds.length > 1)
                    .map((f) => {
                      const links = a.echo.links.filter((l) => f.sourceIds.includes(l.a));
                      return (
                        <div id={f.id} key={f.id} className="card-sm accent p-4 pop" style={{ ["--accent" as string]: "#7048e8" }}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="idtag">{f.id}</span>
                            <span className="font-semibold">Echo family: {f.sourceIds.join(" + ")} count as one source</span>
                          </div>
                          <p className="mt-1 text-sm text-muted">
                            Likely origin: <b className="text-ink">{f.origin}</b> ({f.originReason}): &ldquo;{src(f.origin).title}&rdquo;
                          </p>
                          {links.map((l) => (
                            <div key={l.a + l.b} className="mt-3 rounded-xl border border-line bg-slate-50/70 p-3 text-sm">
                              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                                <span className="idtag bg-white">{l.a}</span>↔<span className="idtag bg-white">{l.b}</span>
                                <span className="chip bg-lilac text-purple">{Math.round(l.overlap * 100)}% of text shared</span>
                                <span className="text-muted">longest copied passage: {l.sharedWords} words</span>
                              </div>
                              <p className="mt-2 italic text-slate-700">&ldquo;{l.example}&rdquo;</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button onClick={() => setEv({ sourceId: l.a, span: l.spanA, label: `Passage shared with ${l.b}` })} className="btn btn-sm">
                                  View in {l.a}
                                </button>
                                <button onClick={() => setEv({ sourceId: l.b, span: l.spanB, label: `Passage shared with ${l.a}` })} className="btn btn-sm">
                                  View in {l.b}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  {a.gaps.filter((g) => g.kind === "echo-only").length > 0 && (
                    <div className="card-sm p-4">
                      <div className="font-semibold">Findings that only look confirmed</div>
                      <ul className="mt-2 space-y-1.5 text-sm">
                        {a.gaps
                          .filter((g) => g.kind === "echo-only")
                          .map((g) => (
                            <li key={g.id} className="flex gap-2 items-start">
                              <button onClick={() => jump(g.id)} className="idtag hover:text-brand">{g.id}</button>
                              <span>{g.explanation}</span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                  {a.echo.families.some((f) => f.sourceIds.length === 1) && (
                    <p className="text-sm text-muted">
                      Wrote their own account:{" "}
                      {a.echo.families
                        .filter((f) => f.sourceIds.length === 1)
                        .map((f) => f.sourceIds[0])
                        .join(", ")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "freshness" && (
            <div className="space-y-3">
              <Intro>
                <Badge kind="rule">Rule-based</Badge> Checked against today&apos;s date: page dates, academic/financial cycles (e.g. 2025-26) and deadlines that have already
                passed.
              </Intro>
              {a.stale.length === 0 && <Empty>All sources look current.</Empty>}
              {a.stale.map((d) => (
                <div id={d.id} key={d.id} className="card-sm accent p-4 pop" style={{ ["--accent" as string]: SEV_ACCENT[d.severity] }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="idtag">{d.id}</span>
                    <span className="font-semibold">
                      {d.sourceId}: {src(d.sourceId).title}
                    </span>
                    <span className={`chip ml-auto uppercase ${SEV_CHIP[d.severity]}`}>{d.kind.replace("-", " ")}</span>
                  </div>
                  <p className="mt-2 text-[15px] text-slate-700">{d.detail}</p>
                  {d.quote && (
                    <button
                      onClick={() => setEv({ sourceId: d.sourceId, span: d.span, label: d.detail })}
                      className="mt-2 block w-full text-left rounded-lg bg-slate-50 border border-line hover:border-brand/50 p-2.5 text-sm transition"
                    >
                      &ldquo;{d.quote}&rdquo; <span className="text-xs font-semibold text-brand">View in source →</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === "checklist" && <Checklist a={a} done={done} setDone={setDone} jump={jump} />}
        </div>
      </div>

      {ev && <EvidenceDrawer ev={ev} source={src(ev.sourceId)} onClose={() => setEv(null)} />}
    </section>
  );
}

function Checklist({ a, done, setDone, jump }: { a: Analysis; done: Set<string>; setDone: (s: Set<string>) => void; jump: (r: string) => void }) {
  const [copied, setCopied] = useState(false);
  const md = useMemo(() => {
    const lines = [`# Verification checklist`, ``, `**Question:** ${a.question}`, `**Generated:** ${new Date(a.generatedAt).toLocaleString()} by Digital Dark Spot`, ``];
    for (const c of a.checklist) lines.push(`- [ ] **${c.priority}** ${c.task}\n  - Why: ${c.reason}\n  - Verify at: ${c.verifyWhere}`);
    lines.push(``, `## Sources reviewed`);
    for (const s of a.sources) lines.push(`- ${s.id}: ${s.title}${s.url ? ` (${s.url})` : ""}${s.date ? `, dated ${s.date}` : ", undated"}${s.official ? " [official]" : ""}`);
    lines.push(``, `_Findings are potential gaps and signals, not guaranteed facts. Confirm with the official issuer._`);
    return lines.join("\n");
  }, [a]);

  const toggle = (id: string) => {
    const n = new Set(done);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setDone(n);
  };
  const download = () => {
    const blob = new Blob([md], { type: "text/markdown" });
    const u = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = u;
    el.download = "verification-checklist.md";
    el.click();
    URL.revokeObjectURL(u);
  };
  const P = { P1: "bg-rose text-red", P2: "bg-peach text-amber-700", P3: "bg-slate-100 text-slate-600" };
  const pct = a.checklist.length ? Math.round((done.size / a.checklist.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Intro className="mr-auto">Prioritised from the conflicts, gaps and freshness findings.</Intro>
        <button
          onClick={() => {
            navigator.clipboard.writeText(md);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="btn btn-sm"
        >
          {copied ? "Copied" : "Copy as Markdown"}
        </button>
        <button onClick={download} className="btn btn-sm">Download .md</button>
        <button onClick={() => window.print()} className="btn btn-sm">Print</button>
      </div>
      <div className="no-print">
        <div className="flex justify-between text-xs font-semibold text-muted mb-1.5">
          <span>Progress</span>
          <span>
            {done.size} of {a.checklist.length} verified
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-green transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {a.checklist.length === 0 && <Empty>Nothing urgent to verify. Still confirm the final decision with the official source.</Empty>}
      <ol className="space-y-2.5">
        {a.checklist.map((c) => (
          <li key={c.id} className={`card-sm p-4 flex gap-3 pop transition ${done.has(c.id) ? "bg-slate-50 opacity-60" : ""}`}>
            <input type="checkbox" checked={done.has(c.id)} onChange={() => toggle(c.id)} className="mt-1 w-4 h-4 accent-brand shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`chip ${P[c.priority]}`}>{c.priority}</span>
                <span className={`font-semibold leading-snug ${done.has(c.id) ? "line-through" : ""}`}>{c.task}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{c.reason}</p>
              <p className="mt-1 text-xs text-muted">Verify at: {c.verifyWhere}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.refs.map((r) => (
                  <button key={r} onClick={() => jump(r)} className="no-print idtag hover:border-brand hover:text-brand transition">
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EvidenceDrawer({ ev, source, onClose }: { ev: Evidence; source: Source; onClose: () => void }) {
  const markRef = useRef<HTMLElement>(null);
  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center" });
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ev, onClose]);
  const t = source.text;
  const [s, e] = ev.span ?? [-1, -1];
  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col">
        <div className="p-5 border-b border-line space-y-3">
          <div className="flex items-start gap-3">
            <span className="idtag mt-1">{source.id}</span>
            <div className="min-w-0 flex-1">
              <div className="eyebrow">Source evidence</div>
              <div className="text-lg font-bold leading-snug">{source.title}</div>
              {source.url && (
                <a href={source.url} target="_blank" rel="noreferrer noopener" className="text-sm text-brand hover:underline break-all">
                  {source.url}
                </a>
              )}
              <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-muted items-center">
                <span>{source.date ? `Dated ${source.date}${source.dateEvidence ? ` (${source.dateEvidence})` : ""}` : "Undated"}</span>
                {source.official && <Badge kind="sourced">Official{source.officialReason ? `: ${source.officialReason}` : ""}</Badge>}
                {source.sample && <span className="chip bg-sky text-blue">Fictional sample</span>}
              </div>
            </div>
            <button onClick={onClose} className="btn btn-sm" aria-label="Close">
              Close
            </button>
          </div>
          <div className="rounded-lg bg-yellow/40 border-2 border-ink text-sm text-ink px-3 py-2">{ev.label}</div>
          {!ev.span && <div className="text-xs text-muted">No exact passage to highlight. Showing the full source.</div>}
        </div>
        <div className="flex-1 overflow-auto scrollbar-thin p-6 text-[15px] leading-7 whitespace-pre-wrap text-slate-700">
          {s >= 0 ? (
            <>
              {t.slice(0, s)}
              <mark ref={markRef} className="ev">
                {t.slice(s, e)}
              </mark>
              {t.slice(e)}
            </>
          ) : (
            t
          )}
        </div>
      </aside>
    </div>
  );
}

function ScoreRing({ score, breakdown }: { score: number; breakdown: string[] }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? "#2f9e44" : score >= 50 ? "#f08c00" : "#e63946";
  const pill = score >= 75 ? "bg-mint text-green" : score >= 50 ? "bg-peach text-amber-700" : "bg-rose text-red";
  const label = score >= 75 ? "Mostly ready" : score >= 50 ? "Verify before deciding" : "Major dark spots";
  return (
    <div className="card p-6 flex flex-col items-center justify-center min-w-[240px]">
      <div className="eyebrow mb-3">Decision readiness</div>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 70 70)" />
        <text x="70" y="78" textAnchor="middle" fontSize="34" fontWeight="800" fill="#0f172a">
          {score}
        </text>
        <text x="70" y="96" textAnchor="middle" fontSize="11" fill="#64748b">
          / 100
        </text>
      </svg>
      <span className={`mt-3 chip text-xs py-1 px-3 ${pill}`}>{label}</span>
      <details className="mt-3 text-xs text-muted max-w-[230px]">
        <summary className="cursor-pointer text-center font-semibold hover:text-ink">How is this scored?</summary>
        <ul className="mt-2 space-y-1 list-disc pl-4">
          {breakdown.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** Sources on a circle; lines join pages that share copied text, colours mark echo families. */
function EchoGraph({ a }: { a: Analysis }) {
  const W = 300, H = 230, cx = W / 2, cy = H / 2, R = 82;
  const FAM_COLORS = ["#ece5ff", "#fff0c2", "#d6ecff", "#ffe0e3"];
  const echoFams = a.echo.families.filter((f) => f.sourceIds.length > 1);
  const fill = (id: string) => {
    const i = echoFams.findIndex((f) => f.sourceIds.includes(id));
    return i >= 0 ? FAM_COLORS[i % FAM_COLORS.length] : "#ffffff";
  };
  const pos = new Map(
    a.sources.map((s, i) => {
      const t = (i / a.sources.length) * Math.PI * 2 - Math.PI / 2;
      return [s.id, { x: cx + R * Math.cos(t), y: cy + R * Math.sin(t) }];
    }),
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Source echo diagram">
      {a.echo.links.map((l) => {
        const p = pos.get(l.a)!, q = pos.get(l.b)!;
        return (
          <g key={l.a + l.b}>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#7048e8" strokeWidth={2 + l.overlap * 8} strokeLinecap="round" strokeDasharray="1 0" opacity="0.8" />
            <rect x={(p.x + q.x) / 2 - 19} y={(p.y + q.y) / 2 - 10} width="38" height="20" rx="10" fill="#fff" stroke="#1d1d1f" strokeWidth="1.5" />
            <text x={(p.x + q.x) / 2} y={(p.y + q.y) / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#7048e8">
              {Math.round(l.overlap * 100)}%
            </text>
          </g>
        );
      })}
      {a.sources.map((s) => {
        const p = pos.get(s.id)!;
        return (
          <g key={s.id}>
            <circle cx={p.x} cy={p.y} r="21" fill={fill(s.id)} stroke="#1d1d1f" strokeWidth="2" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="12" fontWeight="800" fill="#1d1d1f" fontFamily="monospace">
              {s.id}
            </text>
            {s.official && (
              <text x={p.x + 15} y={p.y - 13} fontSize="13" fill="#2f9e44">
                ★
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Stat({ label, value, color, onClick }: { label: string; value: number | string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card-sm p-3.5 text-left hover:border-slate-300 hover:shadow-md transition relative overflow-hidden">
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color }} />
      <div className="text-2xl font-extrabold tracking-tight" style={{ color }}>
        {value}
      </div>
      <div className="mt-0.5 text-xs font-medium text-muted">{label}</div>
    </button>
  );
}

type BadgeKind = "sourced" | "ai" | "uncertain" | "rule" | "gap";
function Badge({ kind, children }: { kind: BadgeKind; children: React.ReactNode }) {
  const s = {
    sourced: "bg-mint text-green",
    ai: "bg-lilac text-purple",
    uncertain: "bg-peach text-amber-700",
    rule: "bg-ice text-blue",
    gap: "bg-rose text-red",
  }[kind];
  return <span className={`chip ${s}`}>{children}</span>;
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs items-center text-muted">
      <span className="mr-1">Legend:</span>
      <Badge kind="sourced">Sourced ✓ quote found</Badge>
      <Badge kind="ai">AI-generated</Badge>
      <Badge kind="rule">Rule-based check</Badge>
      <Badge kind="uncertain">Uncertain</Badge>
    </div>
  );
}

function Intro({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm text-muted ${className}`}>{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line bg-slate-50 p-8 text-center text-sm text-muted">{children}</div>;
}
