import { NextResponse } from "next/server";
import { fetchAndExtract, officialFromUrl } from "@/lib/extract";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });
  try {
    const ex = await fetchAndExtract(url.trim());
    const off = officialFromUrl(url);
    return NextResponse.json({ ...ex, url: url.trim(), official: off.official, officialReason: off.reason });
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError" ? "The site took too long to respond." : (e as Error).message;
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
