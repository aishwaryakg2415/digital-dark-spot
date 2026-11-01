# Digital Dark Spot

Digital Dark Spot helps you find gaps, contradictions, outdated details, and copied information in research sources. Add a research question and sources as URLs or pasted text. The app builds a checklist of what a complete answer should cover, checks each source for evidence, and links findings to supporting passages.

> Built for the Shinchan Online Hackathon 2026 (DEVENGERS problem statement).
>
> **Live demo:** https://digital-dark-spot-iv3z.vercel.app

## Why Digital Dark Spot?

Search engines find pages and summarizers condense them, but neither necessarily tells you what your sources leave out or whether several pages are repeating the same information. Digital Dark Spot checks sources against the needs of your question and highlights potential gaps and conflicts for you to verify.

## How it works

1. **Builds an answer checklist.** For general topics, AI drafts topics a complete answer should address. Supported decision types, such as scholarships, admissions, jobs, and government schemes, use built-in templates.
2. **Extracts evidence.** Sources are analyzed in parallel. Each claim includes a quote from the source; unsupported topics can be left empty.
3. **Verifies quotes.** Quotes are checked against the full source text. Unverified claims are identified and do not count as verified evidence.
4. **Checks for conflicts.** AI compares claims from different sources, while deterministic checks compare values such as dates and amounts.
5. **Finds copied sources.** Sources are compared using shared word sequences. Pages with substantial overlap are grouped into echo families so copied pages are not mistaken for independent sources.
6. **Checks freshness and coverage.** The app flags potentially stale dates and identifies topics that are missing, unverified, supported only by copied sources, or covered only by unofficial sources.
7. **Creates a verification checklist and readiness score.** Checklist items are prioritized and can be exported to Markdown or printed. The score and its formula are shown in the app.

## Features

- Research questions on any topic
- Add sources by URL or paste text, including text copied from PDFs
- Automatically identify some official domains; you can also mark sources as official
- Seven result views: source summaries, coverage map, gaps, conflicts, source echoes, freshness, and a verify-next checklist
- Evidence drawer with source passages highlighted
- Live progress while an analysis runs
- Offline keyword mode when no Groq API key is configured
- Clearly labelled fictional sample scenario for trying the app

Findings are signals to investigate, not definitive answers. AI-generated text is distinguished from verified evidence and rule-based checks.

## Tech stack

- Next.js 15 (App Router), React 19, TypeScript, and Tailwind CSS 4
- Groq API via `groq-sdk`, with JSON output validated using Zod
- Cheerio for extracting readable text from HTML
- No database; analyses are stateless

## Requirements

- Node.js 18.18 or later
- npm
- A Groq API key is optional. Without one, the app uses offline keyword mode.

## Run locally

```powershell
git clone https://github.com/aishwaryakg2415/digital-dark-spot.git
Set-Location digital-dark-spot
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To enable AI analysis, add your key to `.env.local`:

```dotenv
GROQ_API_KEY=your_groq_api_key
```

The other settings are optional:

| Variable | Default | Description |
|---|---|---|
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Model used for planning and comparison |
| `GROQ_EXTRACT_MODELS` | Value of `GROQ_MODEL`, then `openai/gpt-oss-20b` | Comma-separated models used for source extraction |

Check the [Groq model list](https://console.groq.com/docs/models) if a configured model is no longer available.

To create and run a production build:

```powershell
npm run build
npm run start
```

## Try the sample

Choose **Load sample scenario**, then **Find dark spots**. The sample asks whether charging a phone overnight is harmful and how to extend battery life. Its five fictional sources deliberately include copied advice, conflicting claims, an outdated forum post, and unanswered questions about replacement and warranty. Sample pages and figures are fictional and labelled in the app; do not treat them as real product guidance.

## Deploy

The app can be deployed to Vercel. Configure `GROQ_API_KEY` in the deployment's environment settings to enable AI analysis; without it, offline keyword mode remains available.

## Limitations

- PDF files are not fetched or parsed directly. Copy the relevant text and add it as a pasted source.
- Pages that require JavaScript to render may not be readable by the URL fetcher.
- Echo detection finds matching wording; it may not identify paraphrased copies.
- Freshness checks are heuristics. Confirm dates, deadlines, and current requirements with authoritative sources.

## Responsible use

Digital Dark Spot can miss relevant information, and AI summaries can be wrong. Review the cited passages and confirm important decisions with an official or primary source.
