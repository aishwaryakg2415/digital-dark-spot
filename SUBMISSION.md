# Unista submission text

**Project name:** Digital Dark Spot: AI-Assisted Information Gap Detection

**Project description** (paste below):

---

**Problem.** People make important decisions from information spread across many websites: what to study, which scheme to apply for, whether a health or safety claim is true, how to look after a device. Some of that information is outdated, sources contradict each other, important questions go unanswered, and many websites simply copy each other, so five "sources" can really be one. Search engines find information and summarizers condense it, but neither tells you what is missing, what conflicts, what is stale, or how many truly independent sources you have.

**Target users.** Students, job seekers, citizens dealing with public services, consumers checking advice they found online, and researchers. Anyone who needs to know whether what they found is complete and trustworthy enough to act on.

**Solution.** Digital Dark Spot is a web app that finds the "dark spots" in your research on **any topic**. You enter a question and add your sources (URLs or pasted text). The app then:
1. Works out **what a complete answer needs**. For any topic, the AI drafts a checklist of 7–9 things a careful expert would check (direct answer, conditions, risks, recent changes, costs, how to verify). Known decision types (scholarships, admissions, jobs, government schemes) use built-in expert templates.
2. **Extracts evidence** from every source in parallel using Groq (GPT-OSS 120B / 20B). Every claim must include a verbatim quote.
3. **Verifies every quote** against the full page text. Quotes that can't be found are flagged *unverified*, so hallucinated evidence never counts.
4. **Detects contradictions** two ways: the AI compares claims, and rules compare amounts, dates and lists. Both sides are shown with their quotes.
5. **Detects echoes (copied sources).** This is our most distinctive feature. Every pair of sources is compared for shared passages. Pages that copy each other form an "echo family" that counts as **one** independent source, and the likely origin is identified. The dashboard shows "5 pages → 4 independent sources", a source family diagram, and the copied passage highlighted in both pages. Findings that only *look* confirmed because copies agree are flagged.
6. **Flags outdated information** with rules: old page dates, past academic or financial cycles, deadlines that have passed, and undated pages.
7. Computes **gaps** from a topic × source coverage matrix:
   - topics no source covers
   - topics backed only by unverified claims
   - topics backed only by copies of one source
   - topics backed only by unofficial sources
8. Produces a **prioritized verification checklist** (P1–P3), saying where to verify each item. It can be exported to Markdown or printed.
9. Shows a **Readiness Score** (0–100) with a transparent formula.

**How it works.** Question → AI/template answer checklist → parallel AI extraction of relevant passages (JSON mode, zod-validated) → deterministic quote verification → AI and rule-based conflict detection → echo detection (8-word shingle overlap and union-find source families) → date analysis → gap analysis → checklist and score. Results stream to the browser with live progress.

**Key features**
- Works on any topic or research question. Add sources by URL (fetch, cleanup, date detection, soft-404 detection, automatic official-domain detection) or by pasting text.
- Seven views:
  - what the sources say
  - a **coverage heatmap** (topics × sources)
  - gaps
  - side-by-side conflicts
  - **source echoes** with a family diagram
  - freshness
  - the verify-next checklist
- **Evidence drawer**: click any citation or copied passage to see it highlighted in the full source.
- Clear labels separate **sourced facts** (verified quote ✓), **AI-generated** content, **rule-based** checks and **uncertain** signals. Findings are always worded as "potential gap" or "possible conflict".
- Works **without an API key** in offline mode, and falls back to rules automatically if an AI step fails. Groq calls are spread across two models with rate-limit backoff, so a full run takes about 20–30 seconds on a free key.
- Built-in, clearly labelled fictional sample scenario ("Is it bad to charge my phone overnight?"), plus a tested set of real URLs on the same topic.

**Uniqueness / innovation**
- **Echo detection**: it counts *independent* sources, not pages, and exposes copied content that looks like agreement. Ordinary search, summarization and chatbots treat ten copies of one article as ten confirmations.
- It **measures sources against what a complete answer needs**, so "missing" is a concrete, explainable finding rather than a guess.
- **Quote-verified evidence**: AI output is never trusted blindly.
- **Hybrid AI + rules**: the LLM handles language, while deterministic code handles dates, numbers, coverage and copying, where LLMs are unreliable.

**Tech stack.** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Groq API (`groq-sdk`, GPT-OSS 120B/20B, JSON mode), zod, cheerio. Stateless, no database. Private/local URLs are blocked to prevent SSRF.

**Future scope.** Paraphrase-level echo detection with sentence embeddings; PDF upload with page-level citations; permitted web search to suggest sources for each gap; saved analyses with alerts when sources change; Hindi and regional-language sources; user feedback on findings to improve accuracy.

---

**GitHub repository link:** (your repo URL)
**Live demo link:** (optional, e.g. Vercel URL)
