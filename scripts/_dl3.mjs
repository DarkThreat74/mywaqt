import { readFileSync, writeFileSync } from 'fs';
// slug → search terms that actually match source titles
const MAP = {
  "ab-mat-crunch": ["Ab Mat Crunch","crunch ab mat"],
  "back-squat": ["Barbell Back Squat","barbell squat","Back Squat"],
  "bayesian-curl": ["bayesian","Cable Curl","cable biceps curl"],
  "cable-flye": ["Cable Fly","cable flye","standing cable fly"],
  "cable-pullover": ["Cable Pullover","straight arm pulldown","rope pullover"],
  "cable-woodchop": ["Cable Woodchop","woodchop","cable chop"],
  "chest-supported-row": ["Chest Supported Row","chest supported dumbbell row","seal row"],
  "crossbody-lat-pull": ["lat pull around","single arm lat pulldown","cross body lat"],
  "cuffed-lateral-raise": ["lateral raise cable","cable lateral raise","behind back lateral raise"],
  "db-pullover": ["Dumbbell Pullover","dumbbell pull over"],
  "deficit-pendlay-row": ["Pendlay Row","pendlay","deficit row"],
  "deficit-pushup": ["Deficit Push Up","push up handles","deep push up"],
  "farmers-carry": ["Farmers Walk","farmers carry","farmer carry"],
  "ffe-lunge": ["Front Foot Elevated","elevated split squat","front foot elevated split squat"],
  "garhammer-raise": ["Garhammer","bent knee raise","knee raise"],
  "glute-ham-raise": ["Glute Ham Raise","glute ham","ghr"],
  "hip-thrust": ["Barbell Hip Thrust","hip thrust","glute bridge barbell"],
  "janda-situp": ["Janda","sit up band","banded sit up"],
  "jm-press": ["JM Press","jm press triceps"],
  "katana-extension": ["katana","overhead triceps cable","cross body triceps"],
  "kroc-row": ["Kroc Row","kroc","heavy dumbbell row"],
  "leg-extension": ["Leg Extension","leg extensions","seated leg extension"],
  "machine-crunch": ["Machine Crunch","ab crunch machine","seated crunch"],
  "meadows-row": ["Meadows Row","landmine row","meadows"],
  "neck-extension": ["Neck Extension","neck plate","neck extension plate"],
  "neck-flexion": ["Neck Flexion","neck curl","plate neck flexion"],
  "neck-lateral": ["Neck Lateral","lateral neck","side neck"],
  "neck-rotation": ["Neck Rotation","rotating neck","neck turn"],
  "pendulum-squat": ["Pendulum Squat","pendulum","pit shark"],
  "plate-pinch": ["Plate Pinch","pinch grip","plate hold"],
  "pressdown": ["Triceps Pushdown","tricep pushdown","cable pushdown","rope pushdown"],
  "rdl-hamstrings": ["Romanian Deadlift","rdl","romanian deadlift dumbbell"],
  "reverse-nordic": ["Reverse Nordic","reverse nordic curl","lean back quad"],
  "rice-bucket": ["Rice Bucket","forearm rice","wrist rice"],
  "skullcrusher": ["Skull Crusher","skullcrusher","lying triceps extension","ez bar skullcrusher"],
  "tbar-row": ["T Bar Row","tbar row","t-bar row","landmine t row"],
  "towel-pullup": ["Towel Pull Up","towel pullup","towel hang"],
};
const j = async u => { try { const r = await fetch(u); return JSON.parse(await r.text()); } catch { return null; } };
const dl = async (url, slug) => { try { const r = await fetch(url); if (!r.ok) return false;
  const b = Buffer.from(await r.arrayBuffer()); if (b.length < 2000) return false;
  writeFileSync(`public/exercises/${slug}.gif`, b); return true; } catch { return false; } };
let edb = [], c = '', p = 0;
while (p++ < 15) { const d = await j(`https://oss.exercisedb.dev/api/v1/exercises?limit=100${c?'&cursor='+c:''}`); if (!d?.data?.length) break; edb.push(...d.data); if (!d.meta?.hasNextPage) break; c = d.meta.nextCursor; }
const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const ok = [], still = [];
for (const [slug, terms] of Object.entries(MAP)) {
  let done = false;
  for (const t of terms) {
    // EDB exact-ish first (free + clean)
    const hit = edb.find(e => norm(e.name) === norm(t)) || edb.find(e => norm(e.name).includes(norm(t)) && norm(t).length > 4);
    if (hit && await dl(hit.gifUrl, slug)) { ok.push(slug); done = true; break; }
    const list = await j(`https://fitnessprogramer.com/wp-json/wp/v2/media?search=${encodeURIComponent(t)}&per_page=8`);
    const gif = (Array.isArray(list)?list:[]).find(m=>m.guid?.rendered?.endsWith('.gif'))?.guid?.rendered;
    if (gif && await dl(gif, slug)) { ok.push(slug); done = true; break; }
    await new Promise(r=>setTimeout(r,120));
  }
  if (!done) still.push(slug);
}
console.log(`+${ok.length} new; still ${still.length}`);
console.log('STILL:', still.join(','));
