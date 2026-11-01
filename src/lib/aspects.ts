import type { Aspect, Importance } from "./types";

// Decision templates: what a person typically needs to know before acting on a
// given kind of decision. Gap detection checks the sources against this list,
// so "missing" means "a known decision requirement nobody covered", not
// "the model felt something was off".

type T = [id: string, name: string, importance: Importance, why: string, keywords: string[]];

const TEMPLATES: Record<string, { label: string; match: RegExp; aspects: T[] }> = {
  scholarship: {
    label: "Scholarship / financial aid",
    match: /scholar|fellowship|stipend|grant|financial aid|bursary/i,
    aspects: [
      ["eligibility", "Eligibility criteria", "critical", "Decides whether you can apply at all.", ["eligib", "eligible", "criteria", "who can apply", "must be", "percentage", "marks", "cgpa", "class 12", "studying"]],
      ["income", "Income limit", "critical", "Most need-based awards reject applicants above the family income ceiling.", ["income", "lakh", "annual family", "ceiling", "per annum"]],
      ["deadline", "Application deadline", "critical", "Missing it means waiting a full cycle.", ["deadline", "last date", "closing date", "apply by", "before", "until", "extended"]],
      ["documents", "Required documents", "critical", "Incomplete applications are usually rejected.", ["document", "certificate", "marksheet", "aadhaar", "proof", "passbook", "itr", "form 16", "upload", "photograph"]],
      ["process", "Official application process", "critical", "Unofficial portals and agents are a common scam route.", ["apply online", "portal", "register", "application form", "how to apply", "login", "submit"]],
      ["amount", "Award amount & coverage", "important", "Determines whether the award meets your need.", ["amount", "per year", "every year", "tuition", "covers", "award of", "paid", "will receive", "get rs", "provide rs"]],
      ["renewal", "Renewal conditions", "important", "Many awards are lost in year 2 for missing renewal rules.", ["renew", "renewal", "continue", "subsequent year", "next year", "maintain"]],
      ["selection", "Selection process & results", "useful", "Tells you what happens after you apply and when.", ["selection", "merit list", "shortlist", "interview", "result", "announced"]],
      ["contact", "Official contact / helpline", "useful", "Lets you verify anything unclear directly with the issuer.", ["helpline", "contact", "email", "phone", "grievance", "support"]],
    ],
  },
  admission: {
    label: "Admission / course",
    match: /admission|college|university|course|degree|program|entrance|exam/i,
    aspects: [
      ["eligibility", "Eligibility criteria", "critical", "Decides whether you can apply.", ["eligib", "criteria", "minimum", "marks", "percentage", "qualif"]],
      ["deadline", "Application deadline", "critical", "Missing it means waiting a cycle.", ["deadline", "last date", "closing", "apply by", "until"]],
      ["fees", "Fees & costs", "critical", "Total cost affects affordability.", ["fee", "fees", "tuition", "₹", "cost", "per semester", "per year"]],
      ["selection", "Selection / entrance process", "critical", "How candidates are chosen.", ["entrance", "exam", "merit", "counselling", "interview", "cut-off", "cutoff"]],
      ["documents", "Required documents", "important", "Incomplete applications get rejected.", ["document", "certificate", "marksheet", "proof", "upload"]],
      ["seats", "Seats & reservation", "important", "Affects your realistic chances.", ["seat", "intake", "reservation", "quota"]],
      ["accreditation", "Recognition / accreditation", "important", "Unrecognised degrees can be worthless.", ["accredit", "ugc", "aicte", "naac", "recogni", "approved"]],
      ["process", "Official application process", "critical", "Use only the official portal.", ["apply online", "portal", "register", "application form", "how to apply"]],
      ["contact", "Official contact", "useful", "To verify unclear details.", ["contact", "helpline", "email", "phone"]],
    ],
  },
  job: {
    label: "Job / career opportunity",
    match: /job|career|hiring|vacancy|recruit|internship|position|role/i,
    aspects: [
      ["eligibility", "Eligibility & qualifications", "critical", "Whether you qualify.", ["eligib", "qualif", "experience", "degree", "skills", "age limit"]],
      ["deadline", "Application deadline", "critical", "Late applications are ignored.", ["deadline", "last date", "apply by", "closing"]],
      ["compensation", "Salary / compensation", "critical", "Core to the decision.", ["salary", "stipend", "ctc", "pay", "₹", "lpa", "compensation"]],
      ["process", "Official application process", "critical", "Fake job postings are common.", ["apply", "portal", "careers page", "submit", "register"]],
      ["selection", "Selection process", "important", "What to prepare for.", ["interview", "test", "round", "assessment", "selection"]],
      ["location", "Location & work mode", "important", "Remote vs on-site changes everything.", ["location", "remote", "hybrid", "on-site", "office", "relocat"]],
      ["employer", "Employer legitimacy", "important", "Avoid scams.", ["registered", "company", "about us", "official", "verified"]],
      ["contact", "Official contact", "useful", "To verify details.", ["contact", "email", "hr", "phone"]],
    ],
  },
  scheme: {
    label: "Government scheme / public service",
    match: /scheme|yojana|subsidy|pension|benefit|welfare|government|ration|license|licence|passport|certificate/i,
    aspects: [
      ["eligibility", "Eligibility criteria", "critical", "Whether you qualify.", ["eligib", "criteria", "who can", "beneficiar", "must be"]],
      ["benefit", "Benefit / entitlement", "critical", "What you actually get.", ["benefit", "₹", "amount", "subsidy", "entitle", "assistance"]],
      ["documents", "Required documents", "critical", "Missing documents stall applications.", ["document", "certificate", "aadhaar", "proof", "card"]],
      ["process", "Official application process", "critical", "Use only official channels.", ["apply", "portal", "office", "csc", "register", "form"]],
      ["deadline", "Deadline / validity", "important", "Schemes open and close.", ["deadline", "last date", "valid", "until", "closing"]],
      ["fees", "Fees / charges", "important", "Official services usually list exact fees.", ["fee", "charge", "free of cost", "₹"]],
      ["timeline", "Processing time", "useful", "When to expect results.", ["days", "processing", "within", "timeline", "weeks"]],
      ["contact", "Official contact / grievance", "useful", "To verify or escalate.", ["helpline", "grievance", "contact", "toll free"]],
    ],
  },
  general: {
    label: "General research decision",
    match: /.*/,
    aspects: [
      ["definition", "What it is / scope", "important", "Establishes what the sources are actually about.", ["is a", "refers to", "means", "defined"]],
      ["requirements", "Requirements / conditions", "critical", "Conditions you must meet.", ["require", "must", "eligib", "condition", "criteria"]],
      ["cost", "Cost / price", "critical", "Affects feasibility.", ["cost", "price", "fee", "₹", "$", "charge"]],
      ["dates", "Key dates / timeline", "critical", "Timing errors are costly.", ["date", "deadline", "until", "from", "schedule"]],
      ["process", "Process / how to", "important", "How to actually proceed.", ["how to", "step", "apply", "process", "procedure"]],
      ["risks", "Risks / limitations", "important", "What could go wrong.", ["risk", "limitation", "warning", "caution", "not ", "exclud"]],
      ["authority", "Authoritative source", "important", "Who officially owns this information.", ["official", "government", "ministry", "issued by", "authority"]],
      ["contact", "Contact / support", "useful", "To verify unclear points.", ["contact", "helpline", "email", "support"]],
    ],
  },
};

export function detectDecisionType(question: string, corpus = ""): string {
  const q = question.toLowerCase();
  for (const [key, t] of Object.entries(TEMPLATES)) {
    if (key !== "general" && t.match.test(q)) return key;
  }
  const c = corpus.slice(0, 20000);
  for (const [key, t] of Object.entries(TEMPLATES)) {
    if (key !== "general" && (c.match(new RegExp(t.match.source, "gi"))?.length ?? 0) >= 5) return key;
  }
  return "general";
}

export function decisionLabel(type: string): string {
  return TEMPLATES[type]?.label ?? type;
}

export function templateAspects(type: string): Aspect[] {
  const t = TEMPLATES[type] ?? TEMPLATES.general;
  return t.aspects.map(([id, name, importance, why, keywords]) => ({
    id,
    name,
    importance,
    why,
    keywords,
    origin: "template",
  }));
}
