// Apply a SQL migration file to the Neon database.
// Usage: node scripts/apply-sql.mjs drizzle/0063_subscriptions.sql
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-sql.mjs <file.sql>");
  process.exit(1);
}

// Load DATABASE_URL from .env (dotenv not guaranteed installed)
const env = readFileSync(".env", "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!url) {
  console.error("DATABASE_URL not found in .env");
  process.exit(1);
}

const sql = neon(url);
const statements = readFileSync(file, "utf8")
  .split(/;\s*$/m)
  .map((s) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim())
  .filter(Boolean);

for (const stmt of statements) {
  await sql.query(stmt);
  console.log("ok:", stmt.split("\n")[0].slice(0, 70));
}
console.log(`done — ${statements.length} statements applied`);
