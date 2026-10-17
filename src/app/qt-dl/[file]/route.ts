import { NextResponse } from "next/server";

/**
 * Engine asset proxy. The model/corpus live on third-party hosts whose
 * responses carry no CORS headers, so the browser can't fetch them directly.
 * This route streams the bytes through our origin — one place to swap in our
 * own CDN (R2) when install volume grows.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

const UPSTREAM: Record<string, string> = {
  "model.onnx":
    "https://github.com/yazinsai/tilawa/releases/download/zipformer-a0w-ep1-a0.5/zipformer_a0w_ep1_a05.int8.onnx",
  "corpus.json":
    "https://github.com/yazinsai/tilawa/releases/download/v0.3.0/zipformer_quran.json",
};

const MUSHAF_BASE = "https://raw.githubusercontent.com/zonetecde/mushaf-layout/v2";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;

  // Mushaf page data + per-page glyph fonts (604 pages, lazy-fetched)
  let url = UPSTREAM[file];
  if (!url) {
    const page = file.match(/^page-(\d{3})\.json$/);
    const font = file.match(/^p(\d{3})\.woff2$/);
    if (page) url = `${MUSHAF_BASE}/mushaf/QPC2/${file}`;
    else if (font) url = `${MUSHAF_BASE}/fonts/QPC2/${file}`;
  }
  if (!url) return new NextResponse("not found", { status: 404 });

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    return new NextResponse(`upstream ${res.status}`, { status: 502 });
  }
  return new NextResponse(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/octet-stream",
      "content-length": res.headers.get("content-length") ?? "",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
