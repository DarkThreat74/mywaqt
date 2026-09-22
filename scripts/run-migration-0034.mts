import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
import { join } from "path";

const envContent = readFileSync(join(process.cwd(), ".env"), "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const sql = neon(process.env.DATABASE_URL!);

async function run() {
  const statements = readFileSync(join(process.cwd(), "drizzle/0034_masjid_iqamah.sql"), "utf-8")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !s.split("\n").every((l) => l.trim().startsWith("--") || !l.trim()));
  for (const stmt of statements) {
    try {
      await sql.query(stmt);
      console.log("OK:", stmt.split("\n").pop()!.slice(0, 70));
    } catch (e: unknown) {
      if (String(e).includes("already exists") || String(e).includes("duplicate")) {
        console.log("SKIP (exists):", stmt.split("\n").pop()!.slice(0, 70));
      } else {
        throw e;
      }
    }
  }
  console.log("Migration 0033 applied.");
}
run();
