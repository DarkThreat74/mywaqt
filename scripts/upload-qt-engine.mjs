// One-shot: vendor the Quran Tester engine into our own R2 bucket.
// Reads creds from .env, downloads each asset once, uploads to
// quran-tester/<name>. Run: node scripts/upload-qt-engine.mjs
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { tmpdir } from "os";
import { join } from "path";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => l.split("=", 2).map((s) => s.trim())),
);

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const ASSETS = {
  "model.onnx":
    "https://github.com/yazinsai/tilawa/releases/download/zipformer-a0w-ep1-a0.5/zipformer_a0w_ep1_a05.int8.onnx",
  "corpus.json":
    "https://github.com/yazinsai/tilawa/releases/download/v0.3.0/zipformer_quran.json",
};

for (const [name, url] of Object.entries(ASSETS)) {
  const tmp = join(tmpdir(), `qt-${name}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`download ${name}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  const body = readFileSync(tmp);
  await s3.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: `quran-tester/${name}`,
      Body: body,
      ContentType: name.endsWith(".json") ? "application/json" : "application/octet-stream",
    }),
  );
  console.log(`uploaded quran-tester/${name} (${(body.length / 1e6).toFixed(1)}MB)`);
}
