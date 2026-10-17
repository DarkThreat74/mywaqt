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
  "ort-wasm-simd-threaded.wasm":
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort-wasm-simd-threaded.wasm",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const url = UPSTREAM[file];
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
