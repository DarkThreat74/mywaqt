import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const url = await getSignedUrl(
  s3,
  new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: "cors-test/dummy.m4a",
    ContentType: "audio/mp4",
  }),
  { expiresIn: 60 },
);

const origin = process.argv[2] ?? "https://mywaqt.app";
console.log("preflight from", origin);
const res = await fetch(url, {
  method: "OPTIONS",
  headers: {
    Origin: origin,
    "Access-Control-Request-Method": "PUT",
    "Access-Control-Request-Headers": "content-type",
  },
});
console.log("status:", res.status);
for (const [k, v] of res.headers) {
  if (k.startsWith("access-control") || k === "server") console.log(`  ${k}: ${v}`);
}
