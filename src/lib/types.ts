// Shared types for the Digital Dark Spot analysis pipeline.

export type SourceKind = "url" | "text";

export interface Source {
  id: string; // "S1", "S2", ...
  title: string;
  url?: string;
  kind: SourceKind;
  text: string;
  /** ISO date (YYYY-MM-DD) if a publish/update date was detected or entered. */
  date?: string | null;
  /** Where the date came from, e.g. "meta article:published_time" or "entered by user". */
  dateEvidence?: string;
  /** Official / primary source (government, institution, issuer). */
  official: boolean;
  officialReason?: string;
  sample?: boolean;
}

export type Importance = "critical" | "important" | "useful";

/** One thing a person needs to know to make this decision (e.g. "Deadline"). */
export interface Aspect {
  id: string;
  name: string;
  why: string;
  importance: Importance;
  keywords: string[];
  origin: "template" | "ai";
}

export interface Claim {
  id: string; // "C1"...
  aspectId: string;
  sourceId: string;
  statement: string;
  quote: string;
  /** Quote was found in the source text (exact or near-exact). */
  verified: boolean;
  matchScore: number;
  /** Character offsets of the matched quote inside source.text. */
  span?: [number, number];
  origin: "ai" | "heuristic";
}

export type CoverageState = "covered" | "conflict" | "unverified" | "missing";

export interface Gap {
  id: string; // "G1"...
  aspectId: string;
  kind: "missing" | "unverified-only" | "unofficial-only" | "echo-only";
  title: string;
  explanation: string;
  severity: "high" | "medium" | "low";
}

/** Two sources that share copied text. */
export interface EchoLink {
  a: string;
  b: string;
  /** Share of the shorter source's text found in the other (0-1). */
  overlap: number;
  /** Length in words of the longest shared passage. */
  sharedWords: number;
  example: string;
  spanA: [number, number];
  spanB: [number, number];
}

/** Sources that copy each other: together they count as ONE independent source. */
export interface EchoFamily {
  id: string; // "F1"...
  sourceIds: string[];
  origin: string;
  originReason: string;
}

export interface EchoReport {
  links: EchoLink[];
  families: EchoFamily[];
  independentCount: number;
}

export interface Conflict {
  id: string; // "X1"...
  aspectId: string;
  summary: string;
  claimIds: string[];
  confidence: "likely" | "possible";
  origin: "ai" | "heuristic";
}

export interface StaleSignal {
  id: string; // "D1"...
  sourceId: string;
  kind: "old-date" | "old-cycle" | "undated" | "past-deadline";
  detail: string;
  quote?: string;
  span?: [number, number];
  severity: "high" | "medium" | "low";
}

export interface ChecklistItem {
  id: string;
  priority: "P1" | "P2" | "P3";
  task: string;
  reason: string;
  /** Finding ids (G*, X*, D*, C*) this item is based on. */
  refs: string[];
  verifyWhere: string;
}

export interface AspectSummary {
  aspectId: string;
  text: string;
  claimIds: string[];
}

export interface Analysis {
  question: string;
  decisionType: string;
  engine: "groq" | "heuristic";
  model?: string;
  generatedAt: string;
  aspects: Aspect[];
  sources: Source[];
  claims: Claim[];
  coverage: Record<string, Record<string, CoverageState>>; // aspectId -> sourceId -> state
  gaps: Gap[];
  conflicts: Conflict[];
  stale: StaleSignal[];
  echo: EchoReport;
  summary: AspectSummary[];
  checklist: ChecklistItem[];
  readiness: { score: number; breakdown: string[] };
  /** Things the AI suggested that are not backed by sources (questions to ask, etc). */
  aiSuggestions: string[];
  warnings: string[];
}
