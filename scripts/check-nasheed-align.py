# Verify lineTimes/wordTimes in src/lib/nasheeds.ts: correct lengths, monotone,
# within duration of each track's audio.
import re, subprocess
from pathlib import Path

TS = Path(__file__).resolve().parent.parent / "src/lib/nasheeds.ts"
AUDIO = TS.parent.parent / "public/audio/nasheeds"
text = TS.read_text(encoding="utf-8")

pat = re.compile(r"lines:\s*\[([^\]]*)\]\s*,?\s*lineTimes:\s*\[([^\]]*)\]\s*,?\s*wordTimes:\s*\[([^\]]*)\]", re.S)
q = re.compile(r'"((?:[^"\\]|\\.)*)"')
dur_cache = {}
problems = 0
for m in pat.finditer(text):
    lines = q.findall(m.group(1))
    lt = [float(x) for x in m.group(2).split(",") if x.strip()]
    wt = [float(x) for x in m.group(3).split(",") if x.strip()]
    nw = sum(len(l.split()) for l in lines)
    ln = text[:m.start()].count("\n") + 1
    # find owning slug (search backwards for slug: "x")
    slug = re.findall(r'slug:\s*"([^"]+)"', text[:m.start()])[-1]
    dur = dur_cache.get(slug)
    if dur is None:
        f = AUDIO / f"{slug}.mp3"
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries",
            "format=duration", "-of", "csv=p=0", str(f)],
            capture_output=True, check=True, text=True).stdout.strip()) if f.exists() else 0
        dur_cache[slug] = dur
    bad = []
    if len(lt) != len(lines): bad.append(f"lineTimes {len(lt)} != {len(lines)} lines")
    if len(wt) != nw: bad.append(f"wordTimes {len(wt)} != {nw} words")
    if not all(b >= a for a, b in zip(wt, wt[1:])): bad.append("wordTimes not monotone")
    if dur and wt and wt[-1] > dur: bad.append(f"past end {wt[-1]} > {dur:.1f}")
    if bad:
        problems += 1
        print(f"{slug}:{ln} -> {bad}")
print("OK" if problems == 0 else f"{problems} problem stanzas")
