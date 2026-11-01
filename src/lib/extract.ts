import * as cheerio from "cheerio";

// Fetch a URL server-side and turn it into clean, readable text plus any
// publish/update date we can find in the page metadata.

const MAX_CHARS = 40000;

const OFFICIAL_SUFFIXES = [".gov", ".gov.in", ".nic.in", ".edu", ".edu.in", ".ac.in", ".gov.uk", ".ac.uk", ".gc.ca", ".gov.au", ".edu.au", ".int", ".mil", ".europa.eu"];

export function officialFromUrl(url?: string): { official: boolean; reason?: string } {
  if (!url) return { official: false };
  try {
    const host = new URL(url).hostname.toLowerCase();
    const suffix = OFFICIAL_SUFFIXES.find((s) => host.endsWith(s));
    if (suffix) return { official: true, reason: `Domain ends in ${suffix}` };
  } catch {}
  return { official: false };
}

function isPrivateHost(host: string) {
  return (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\.|^10\.|^0\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]"
  );
}

export interface Extracted {
  title: string;
  text: string;
  date: string | null;
  dateEvidence?: string;
  truncated: boolean;
}

function toIsoDate(v?: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime()) || d.getFullYear() < 1995) return null;
  return d.toISOString().slice(0, 10);
}

export async function fetchAndExtract(rawUrl: string): Promise<Extracted> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http(s) URLs are supported.");
  if (isPrivateHost(url.hostname)) throw new Error("Local/private network addresses are not allowed.");

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DigitalDarkSpot/1.0; research tool)",
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`The site responded with HTTP ${res.status}.`);
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("pdf")) throw new Error("PDFs aren't fetched directly yet. Open the PDF, copy its text, and add it as pasted text.");
  const body = await res.text();

  if (!type.includes("html")) {
    return { title: url.hostname, text: body.slice(0, MAX_CHARS), date: null, truncated: body.length > MAX_CHARS };
  }

  const $ = cheerio.load(body);
  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    url.hostname;
  // "Soft 404": an error page served with HTTP 200
  if (/^(404|page not found|not found)\b/i.test(title) || /\b404\b.*not found|page not found/i.test($("h1").first().text())) {
    throw new Error("That page doesn't exist (the site shows a 'not found' page). Check the URL.");
  }

  // Dates: metadata first, then JSON-LD, then <time>.
  const metaDates: [string, string | undefined][] = [
    ["meta article:modified_time", $('meta[property="article:modified_time"]').attr("content")],
    ["meta article:published_time", $('meta[property="article:published_time"]').attr("content")],
    ["meta og:updated_time", $('meta[property="og:updated_time"]').attr("content")],
    ["meta date", $('meta[name="date"], meta[name="DC.date"], meta[name="dc.date"], meta[name="last-modified"]').attr("content")],
    ["itemprop dateModified", $('[itemprop="dateModified"]').attr("content") ?? $('[itemprop="dateModified"]').attr("datetime")],
    ["itemprop datePublished", $('[itemprop="datePublished"]').attr("content") ?? $('[itemprop="datePublished"]').attr("datetime")],
  ];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    const mod = raw.match(/"dateModified"\s*:\s*"([^"]+)"/);
    const pub = raw.match(/"datePublished"\s*:\s*"([^"]+)"/);
    if (mod) metaDates.push(["JSON-LD dateModified", mod[1]]);
    if (pub) metaDates.push(["JSON-LD datePublished", pub[1]]);
  });
  metaDates.push(["<time> element", $("time[datetime]").first().attr("datetime")]);
  let date: string | null = null;
  let dateEvidence: string | undefined;
  for (const [label, v] of metaDates) {
    const iso = toIsoDate(v);
    if (iso) {
      date = iso;
      dateEvidence = label;
      break;
    }
  }

  $("script, style, noscript, svg, iframe, form, nav, footer, aside, [role=navigation], [aria-hidden=true], .cookie, #cookie-banner, .mw-editsection, sup.reference, .navbox, #toc, .toc, [class*=interlanguage], #p-lang").remove();
  $("br").replaceWith("\n");
  $("p, div, li, h1, h2, h3, h4, h5, h6, tr, section, article, table, ul, ol, dd, dt, blockquote, pre").each((_, el) => {
    $(el).append("\n");
  });
  $("td, th").each((_, el) => {
    $(el).append(" | ");
  });

  const pick = (sel: string) => $(sel).first().text();
  let raw = pick("main");
  if (raw.trim().length < 400) raw = pick("article");
  if (raw.trim().length < 400) raw = $("body").text();

  const seen = new Set<string>();
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l) => {
      if (l.length < 2 || seen.has(l)) return false;
      seen.add(l);
      return true;
    });
  // Drop menu-like runs: 6+ consecutive lines of 1-3 words (language pickers, nav lists).
  const short = lines.map((l) => l.split(" ").length <= 3);
  const keep = lines.map(() => true);
  for (let i = 0; i < lines.length; ) {
    let j = i;
    while (j < lines.length && short[j]) j++;
    if (j - i >= 6) for (let k = i; k < j; k++) keep[k] = false;
    i = Math.max(j, i + 1);
  }
  let text = lines.filter((_, i) => keep[i]).join("\n");
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);
  if (text.length < 200) throw new Error("Very little readable text was found (the page may need JavaScript). Paste its text instead.");

  return { title, text, date, dateEvidence, truncated };
}
