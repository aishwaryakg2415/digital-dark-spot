"use client";

import { useEffect, useRef, useState } from "react";
import type { Analysis, Source } from "@/lib/types";
import { SAMPLE_QUESTION, SAMPLE_SOURCES } from "@/lib/sample";
import Results from "./Results";

type Draft = Omit<Source, "id"> & { key: string };

const STAGES = [
  ["plan", "Work out what a complete answer needs"],
  ["extract", "Extract evidence from each source"],
  ["compare", "Compare sources for conflicts"],
  ["echo", "Detect copied sources (echoes)"],
  ["freshness", "Check dates & cycles"],
  ["gaps", "Find gaps & build checklist"],
] as const;

let keySeq = 0;
const newKey = () => `k${++keySeq}`;

export default function App() {
  const [question, setQuestion] = useState("");
  const [sources, setSources] = useState<Draft[]>([]);
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [fetching, setFetching] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ engine: string; model: string | null } | null>(null);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<{ stage: string; detail?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  function loadSample() {
    setQuestion(SAMPLE_QUESTION);
    setSources(SAMPLE_SOURCES.map((s) => ({ ...s, key: newKey() })));
    setAnalysis(null);
    setError(null);
  }

  async function addUrl() {
    if (!url.trim()) return;
    setFetching(true);
    setAddError(null);
    try {
      const res = await fetch("/api/fetch-source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSources((s) => [
        ...s,
        { key: newKey(), kind: "url", title: data.title, url: data.url, text: data.text, date: data.date, dateEvidence: data.dateEvidence, official: data.official, officialReason: data.officialReason },
      ]);
      setUrl("");
    } catch (e) {
      setAddError((e as Error).message);
    } finally {
      setFetching(false);
    }
  }

  function addText() {
    if (pasteText.trim().length < 50) {
      setAddError("Paste at least a paragraph of text.");
      return;
    }
    setSources((s) => [...s, { key: newKey(), kind: "text", title: pasteTitle.trim() || `Pasted source ${s.length + 1}`, text: pasteText.trim(), date: null, official: false }]);
    setPasteText("");
    setPasteTitle("");
    setAddError(null);
  }

  const update = (key: string, patch: Partial<Draft>) => setSources((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function run() {
    setRunning(true);
    setError(null);
    setAnalysis(null);
    setStage({ stage: "plan" });
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, sources: sources.map(({ key: _key, ...s }) => s) }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "progress") setStage({ stage: ev.stage, detail: ev.detail });
          else if (ev.type === "result") {
            setAnalysis(ev.analysis);
            setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
          } else if (ev.type === "error") throw new Error(ev.error);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      setStage(null);
    }
  }

  const canRun = question.trim().length > 5 && sources.length > 0 && !running;
  const stageIdx = stage ? STAGES.findIndex(([k]) => k === stage.stage) : -1;

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 border-b-2 border-ink bg-brand text-white">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-3">
          <Logo className="w-10 h-10" />
          <div className="leading-tight">
            <div className="font-display text-[22px] font-extrabold tracking-tight [text-shadow:1.5px_1.5px_0_#1d1d1f]">Digital Dark Spot</div>
            <div className="hidden sm:block text-xs font-semibold text-white/90">Information gap detection</div>
          </div>
          {status && (
            <span
              className="ml-auto chip bg-white text-ink text-[12px] py-1 px-2.5"
              title={status.engine === "groq" ? "AI extraction via Groq" : "Set GROQ_API_KEY to enable AI extraction"}
            >
              <span className={`w-2 h-2 rounded-full ${status.engine === "groq" ? "bg-green" : "bg-orange"}`} />
              {status.engine === "groq" ? (
                <>
                  <span className="hidden sm:inline">AI engine: </span>Groq · {status.model}
                </>
              ) : (
                "Offline keyword mode"
              )}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        {!analysis && !running && (
          <section className="card bg-brand-soft p-6 sm:p-8 flex flex-col md:flex-row items-center gap-6 pop">
            <Logo className="w-28 h-28 sm:w-32 sm:h-32 shrink-0 bob" />
            <div className="relative card-sm px-5 py-5 sm:px-6 flex-1 text-center md:text-left">
              <span className="hidden md:block absolute -left-[13px] top-1/2 -translate-y-1/2 w-0 h-0 border-y-[11px] border-y-transparent border-r-[12px] border-r-ink" />
              <span className="eyebrow">Know what you don&apos;t know before you decide</span>
              <h1 className="mt-1 text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.1]">
                Search finds information. <span className="text-brand-dark">We find what&apos;s missing.</span>
              </h1>
              <p className="mt-3 text-[15px] sm:text-base text-muted">
                Add the sources you&apos;re relying on. Digital Dark Spot checks them against what your decision actually needs, then flags gaps,
                contradictions and outdated details, each one linked to the exact source passage.
              </p>
              <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-2 text-[13px]">
                {[
                  ["bg-mint", "Quote-verified evidence"],
                  ["bg-rose", "Conflict detection"],
                  ["bg-lilac", "Copied-source (echo) detection"],
                  ["bg-peach", "Freshness checks"],
                  ["bg-ice", "Prioritised checklist"],
                ].map(([bg, label]) => (
                  <span key={label} className={`chip ${bg} text-[12.5px] py-1 px-3`}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="no-print grid gap-6 lg:grid-cols-5">
          {/* Question */}
          <div className="lg:col-span-2 card p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold flex items-center gap-2.5">
                <Step n={1} /> Your question
              </h2>
              <button onClick={loadSample} className="btn btn-sm">Load sample scenario</button>
            </div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={4}
              placeholder="Any question or decision, e.g. Is it safe to charge my phone overnight? · What should I check before switching to a new laptop OS? · What should I verify before applying for this scholarship?"
              className="field resize-none"
            />
            <p className="text-sm text-muted">
              Any topic works. Phrase it as a question or decision (&quot;is it safe to…&quot;, &quot;before I…&quot;); the AI works out what a complete answer needs and measures your sources against it.
            </p>

            <div className="pt-4 border-t border-line">
              <button onClick={run} disabled={!canRun} className="btn btn-primary btn-big w-full">
                {running ? (
                  <>
                    <Spinner light /> Analysing…
                  </>
                ) : (
                  <>
                    <SearchIcon /> Find dark spots{sources.length ? ` in ${sources.length} source${sources.length === 1 ? "" : "s"}` : ""}
                  </>
                )}
              </button>
              {running && (
                <ol className="mt-5 space-y-3">
                  {STAGES.map(([k, label], i) => (
                    <li key={k} className="flex items-start gap-3 text-sm">
                      <span
                        className={`mt-0.5 w-5 h-5 shrink-0 grid place-items-center rounded-full ${
                          i < stageIdx ? "bg-green text-white" : i === stageIdx ? "bg-brand-soft" : "bg-slate-100"
                        }`}
                      >
                        {i < stageIdx ? <CheckIcon /> : i === stageIdx ? <Spinner /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
                      </span>
                      <span className={i <= stageIdx ? "font-medium" : "text-muted"}>
                        {label}
                        {i === stageIdx && stage?.detail && <span className="block text-xs text-muted font-normal mt-0.5">{stage.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {error && <p className="mt-3 text-sm font-medium text-red">{error}</p>}
            </div>
          </div>

          {/* Sources */}
          <div className="lg:col-span-3 card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold flex items-center gap-2.5">
                <Step n={2} /> Sources to review
              </h2>
              <span className="text-sm text-muted">{sources.length} / 8</span>
            </div>

            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 space-y-3">
              <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 text-sm">
                {(["url", "text"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1 rounded-md font-medium transition ${mode === m ? "bg-white shadow-sm text-ink" : "text-muted hover:text-ink"}`}
                  >
                    {m === "url" ? "Add by URL" : "Paste text"}
                  </button>
                ))}
              </div>
              {mode === "url" ? (
                <div className="flex gap-2">
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addUrl()}
                    placeholder="https://official-site.gov.in/scholarship-notice"
                    className="field flex-1 min-w-0"
                  />
                  <button onClick={addUrl} disabled={fetching || sources.length >= 8} className="btn">
                    {fetching ? <Spinner /> : null}
                    {fetching ? "Fetching" : "Fetch"}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="Title (e.g. Official notice PDF)" className="field" />
                  <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} placeholder="Paste the text of a page, PDF or notice…" className="field" />
                  <button onClick={addText} disabled={sources.length >= 8} className="btn">Add source</button>
                </div>
              )}
              {addError && <p className="text-sm font-medium text-red">{addError}</p>}
            </div>

            {sources.length === 0 ? (
              <div className="rounded-xl border border-line py-10 text-center text-sm text-muted">
                No sources yet. Add 2–6 pages about the same topic, ideally including the official one.
              </div>
            ) : (
              <ul className="space-y-2.5 max-h-[440px] overflow-auto scrollbar-thin pr-1">
                {sources.map((s, i) => (
                  <li key={s.key} className={`card-sm p-3.5 pop ${s.official ? "accent" : ""}`} style={{ ["--accent" as string]: "#2f9e44" }}>
                    <div className="flex items-start gap-3">
                      <span className="idtag mt-0.5">S{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[15px] truncate">{s.title}</div>
                        {s.url && <div className="text-xs text-muted truncate">{s.url}</div>}
                        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-600">
                          <span>{s.text.split(/\s+/).length.toLocaleString()} words</span>
                          <label className="flex items-center gap-1.5">
                            Date
                            <input
                              type="date"
                              value={s.date ?? ""}
                              onChange={(e) => update(s.key, { date: e.target.value || null, dateEvidence: "entered by user" })}
                              className="border border-line rounded-md px-1.5 py-0.5 text-[13px] bg-white"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer" title={s.officialReason}>
                            <input
                              type="checkbox"
                              checked={s.official}
                              onChange={(e) => update(s.key, { official: e.target.checked, officialReason: e.target.checked ? "Marked official by user" : undefined })}
                              className="w-4 h-4 accent-green"
                            />
                            Official source
                          </label>
                          {s.sample && <span className="chip bg-sky text-blue">Fictional sample</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => setSources((x) => x.filter((y) => y.key !== s.key))}
                        className="w-7 h-7 shrink-0 grid place-items-center rounded-md text-slate-400 hover:text-red hover:bg-rose transition"
                        aria-label="Remove source"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <div ref={resultsRef} className="scroll-mt-20">{analysis && <Results analysis={analysis} />}</div>
      </main>

      <footer className="no-print border-t border-line bg-white/60">
        <div className="mx-auto max-w-6xl px-4 py-5 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Logo className="w-5 h-5" />
          <span className="font-semibold text-ink">Digital Dark Spot</span>
          <span>·</span>
          <span>Findings are signals to verify, not guaranteed facts. Always confirm decisions with the official issuer.</span>
        </div>
      </footer>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return <span className="inline-grid place-items-center w-7 h-7 rounded-full bg-brand text-white border-2 border-ink text-sm font-extrabold">{n}</span>;
}

function Spinner({ light = false }: { light?: boolean }) {
  return <span className={`inline-block w-3.5 h-3.5 border-2 rounded-full animate-spin ${light ? "border-white border-t-transparent" : "border-brand border-t-transparent"}`} />;
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
      <path d="M2.5 6.5l2.2 2.2L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Mascot: a magnifying glass with a "dark spot" that looks around. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden>
      <rect x="38" y="40" width="10" height="22" rx="4" transform="rotate(-45 43 51)" fill="#ffd23f" stroke="#1d1d1f" strokeWidth="3" />
      <circle cx="27" cy="27" r="20" fill="#cdeafe" stroke="#1d1d1f" strokeWidth="4" />
      <circle cx="27" cy="27" r="20" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="14 200" strokeDashoffset="-38" strokeLinecap="round" />
      <circle cx="29" cy="30" r="9" fill="#1d1d1f" />
      <circle cx="26" cy="28" r="2.6" fill="#fff" />
      <circle cx="33" cy="28" r="2.6" fill="#fff" />
      <circle cx="26.8" cy="28.5" r="1.2" fill="#1d1d1f" />
      <circle cx="33.8" cy="28.5" r="1.2" fill="#1d1d1f" />
    </svg>
  );
}
