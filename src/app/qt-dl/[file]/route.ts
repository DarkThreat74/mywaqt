import { NextResponse } from "next/server";
import { Readable } from "stream";
import { streamObject } from "@/lib/r2/client";

/**
 * Engine asset proxy. The model/corpus are vendored in our own R2 bucket
 * (quran-tester/<file>); mushaf pages/fonts fall back to the upstream mirror.
 * Streaming through our origin keeps the browser on connect-src 'self'.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

const R2_ENGINE = new Set(["model.onnx", "corpus.json"]);

const MUSHAF_BASE = "https://raw.githubusercontent.com/zonetecde/mushaf-layout/v2";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;

  if (R2_ENGINE.has(file)) {
    try {
      const { stream, contentType, contentLength } = await streamObject(`quran-tester/${file}`);
      return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        headers: {
          "content-type": contentType ?? "application/octet-stream",
          ...(contentLength ? { "content-length": String(contentLength) } : {}),
          "cache-control": "no-store",
        },
      });
    } catch {
      return new NextResponse("engine asset unavailable", { status: 502 });
    }
  }

  // Mushaf page data + per-page glyph fonts (604 pages, lazy-fetched)
  let url: string | undefined;
  const page = file.match(/^page-(\d{3})\.json$/);
  const font = file.match(/^p(\d{3})\.woff2$/);
  if (page) url = `${MUSHAF_BASE}/mushaf/QPC2/${file}`;
  else if (font) url = `${MUSHAF_BASE}/fonts/QPC2/${file}`;
  if (!url) return new NextResponse("not found", { status: 404 });

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    return new NextResponse(`upstream ${res.status}`, { status: 502 });
  }
  return new NextResponse(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/octet-stream",
      "content-length": res.headers.get("content-length") ?? "",
      // no-store: this proxies the one-time engine download. An immutable
      // year-long cache made "reinstall" pull the 66MB from the HTTP cache
      // instantly — looking like the delete never happened. Cache Storage
      // (quran-tester-engine-v1) is the intended persistence layer.
      "cache-control": "no-store",
    },
  });
}
