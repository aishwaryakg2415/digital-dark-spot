# Digital Dark Spot

**AI-assisted information gap detection, for any topic.** Search tools find information and summarizers condense it. Digital Dark Spot looks for **what's missing**: it works out what a complete answer to your question needs, checks your sources against it, and flags gaps, contradictions, outdated details and **copied sources pretending to be independent**. Every finding links back to the exact source passage.

> Built for the Shinchan Online Hackathon 2026 (DEVENGERS problem statement).

## The problem

You ask "Is it bad to charge my phone overnight?" and read five pages. Three say it's fine, one 2013 forum says it'll catch fire, and one tells you to drain the battery to 0% every month. Two of the "fine" pages turn out to be the same article, copied. Nobody mentioned what to do when battery health drops.

Search and chatbots answer the question you ask. They don't tell you which questions you forgot to ask, which answers disagree, which are out of date, or that your "multiple sources" are one source repeated.

## What makes it different

1. **It measures sources against what the question needs.** It doesn't just summarize them. For any question, the AI first drafts a checklist of what a complete, safe answer must cover. Known decision types (scholarships, admissions, jobs, government schemes) use built-in expert templates. "Missing" then means a concrete topic that no source covers.
2. **Echo detection.** Websites copy each other. The app compares every pair of sources for shared passages (8-word shingles). Pages that copy each other are grouped into an **echo family** that counts as **one** independent source, with the likely origin identified. "Four sites agree" can become "**2 independent sources**", and findings that only *look* confirmed are flagged.
3. **Every AI quote is checked against the page.** If a quote can't be found in the source text, the claim is marked *unverified* and never counts as evidence.
4. **AI plus rules.** The LLM handles language. Deterministic code handles what LLMs get wrong: dates, cycles, numbers, coverage and copying.

## How it works

```
Question ─► Answer checklist ─► Evidence extraction ─► Quote verification ─► Conflicts ─► Echo detection ─► Freshness ─► Gaps + Checklist
            (AI / template)      (Groq, parallel)       (rules)               (AI+rules)   (rules)            (rules)      (rules)
```

1. **Answer checklist.** For any topic, Groq drafts 7–9 plain-language things a complete answer must cover, each with an importance level and keywords. Known decision types (scholarship, admission, job, government scheme) start from a built-in template, and the AI adds up to 3 topics.
2. **Evidence extraction.** Sources are read in parallel. Long pages are cut down to their most relevant passages before going to the model. For each checklist topic the model must return a statement **plus a verbatim quote**, and it is told that leaving a topic empty is correct when the page doesn't cover it.
3. **Quote verification.** Every quote is searched for in the full page (exact match, then fuzzy token-window matching). If it isn't found, the claim is marked **unverified**.
4. **Conflict detection.** Groq compares verified claims across sources and must cite claims from at least two different sources, or the conflict is discarded. A rule-based checker also compares amounts, dates and document lists.
5. **Echo detection** (rule-based). Pairs of sources that share a 25+ word passage, or 15%+ of their text, are linked. Linked sources form a family, and the likely origin is chosen as the official page, else the earliest dated, else the one with the most shared text. A topic covered only by one family of unofficial pages becomes an *echo-only* gap.
6. **Freshness** (rule-based). Flags page dates more than 12 months old, academic or financial cycles older than the current one (e.g. "2025-26"), deadline-like dates that have passed, and undated pages.
7. **Gaps**, from the topic × source coverage matrix:
   * *missing*: no source covers the topic
   * *unverified-only*: only unverifiable AI claims cover it
   * *echo-only*: it looks confirmed, but only by copies of one source
   * *unofficial-only*: no official source covers it
8. **Verification checklist.** Items are ranked P1–P3, each says where to verify it, and the checklist can be exported to Markdown or printed.
9. **Readiness score (0–100).** Topics are weighted by importance, with full credit only for a verified quote from an official source and no conflict. The formula is shown in the UI.

### Telling sources apart from AI

| Label | Meaning |
|---|---|
| 🟢 **Sourced ✓** | The quote was found in the source text. Click to see it highlighted. |
| 🟣 **AI-generated** | Summaries, checklist topics, suggested questions |
| 🔵 **Rule-based** | Deterministic checks (gaps, echoes, dates, value comparison) |
| 🟠 **Uncertain** | Unverified quotes, *possible* conflicts, freshness warnings |

Every finding is phrased as a *potential* gap or *possible* conflict, never as a fact.

## Features

- Works for **any topic or research question**
- Add sources **by URL** (server-side fetch, cleanup, soft-404 detection, and dates from meta tags or JSON-LD) or **paste text** (for PDFs and notices)
- Mark sources as **official**. `.gov`, `.gov.in`, `.nic.in`, `.edu`, `.ac.in` and similar domains are detected automatically
- Seven result views:
  - what the sources say
  - coverage map (topics × sources heatmap)
  - gaps
  - conflicts (side-by-side quotes)
  - **source echoes** (family diagram plus the copied passages)
  - freshness
  - verify-next checklist
- **Evidence drawer**: click any citation or copied passage to open the full source with the exact text highlighted
- Live progress as the analysis runs (streamed NDJSON)
- **Works without an API key** in offline keyword mode, and falls back to rules if any AI step fails
- Built-in **sample scenario** (fictional, clearly labelled) for a reliable demo

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript** + **Tailwind CSS 4**
- **Groq** (`groq-sdk`) in JSON mode, validated with **zod**:
  - `openai/gpt-oss-120b` for planning and comparison
  - extraction spread across `gpt-oss-120b` and `gpt-oss-20b` (separate rate limits), with automatic switching and backoff on 429s
- **cheerio** for HTML extraction
- No database. Analyses are stateless, and private/local URLs are blocked to prevent SSRF

## Setup

Requires Node.js 18.18+.

```bash
git clone <this repo>
cd digital-dark-spot
npm install
cp .env.example .env.local   # then paste your Groq key (optional)
npm run dev
```

Open http://localhost:3000, click **Load sample scenario**, then **Find dark spots**. A full AI run takes about 20–30 seconds on a free Groq key.

| Env var | Required | Default |
|---|---|---|
| `GROQ_API_KEY` | No (offline mode without it) | none |
| `GROQ_MODEL` | No | `openai/gpt-oss-120b` |
| `GROQ_EXTRACT_MODELS` | No | `GROQ_MODEL,openai/gpt-oss-20b` |

Groq retires models from time to time. If you get a "model not found" error, check the [model list](https://console.groq.com/docs/models).

### Deploy

Deploys to Vercel as-is: import the repo and add `GROQ_API_KEY` in project settings.

## Demo flow

**Built-in sample** (fictional, labelled): *"Is it bad to charge my phone overnight, and how should I charge it so the battery lasts longer?"* with five sources: a phone maker's support page, a tech blog, a content-farm article, a 2013 forum thread and a news story.

1. **Load sample scenario**, then **Find dark spots**, and watch the stages run.
2. **Independent sources: 4/5.** Open **Source echoes**: the content-farm article (S3) copied 49% of the tech blog (S2). Click **View in S2 / View in S3** to see the identical passage highlighted in both.
3. **Conflicts**:
   - the 2013 forum says never charge overnight (overcharging, fire) and to drain to 0% (memory effect), while the maker says it's safe and there is no memory effect;
   - the content farm says drain to 0% monthly "to calibrate";
   - battery life is quoted as ~500 cycles by some sources and 1,000 by the maker.
4. **Gaps**: topics no source covers (e.g. what to do when battery health drops, replacement and warranty), and the "20–80%" advice, which looks confirmed but only by the two copies.
5. **Freshness**: the forum thread is from 2013, and the blog is more than 2 years old.
6. **Verify next**: the prioritized checklist, including "count S2 and S3 as one source". Export it to Markdown.

**Real-world run** (live websites):

- `https://www.apple.com/batteries/maximizing-performance/`
- `https://support.apple.com/en-us/108055`
- `https://batteryuniversity.com/article/bu-808-how-to-prolong-lithium-based-batteries`
- `https://en.wikipedia.org/wiki/Memory_effect`

## Project structure

```
src/
  app/
    api/analyze/route.ts       streaming analysis endpoint
    api/fetch-source/route.ts  URL fetch + text extraction
    api/status/route.ts        reports AI vs offline engine
  components/
    App.tsx                    question + sources input
    Results.tsx                dashboard, coverage map, echo diagram, evidence drawer, checklist
  lib/
    analyze.ts                 pipeline: answer checklist, extraction, gaps, score, checklist
    echo.ts                    copied-source (echo) detection
    aspects.ts                 built-in decision templates
    llm.ts                     Groq JSON client with multi-model rate-limit handling
    verify.ts                  quote verification
    dates.ts                   freshness detection
    heuristic.ts               offline extraction + value-based conflict detection
    extract.ts                 HTML → text, dates, official-domain and soft-404 detection
    sample.ts                  fictional demo sources
```

## Limitations & future scope

- PDFs must be pasted as text for now. Next step: PDF upload with page-level citations.
- Pages that need JavaScript to render can't be fetched; paste their text instead.
- Echo detection finds copied *wording*. Paraphrased copies (the same facts rewritten) are a planned extension using sentence embeddings.
- Planned: permitted web search to *suggest* sources for each gap and each echo-only finding.
- Planned: saved analyses with alerts when a source changes.
- Planned: multilingual sources (Hindi and other regional languages).

## Responsible use

Digital Dark Spot reports **signals to verify**, not answers. It can miss information the sources do contain, and AI summaries can be wrong. That's why every claim is linked to its quote and unverifiable quotes are flagged. Always confirm important decisions with an official or primary source.
#   d i g i t a l - d a r k - s p o t  
 