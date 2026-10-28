import re
from pathlib import Path
text = (Path(__file__).resolve().parent.parent / "src/lib/nasheeds.ts").read_text(encoding="utf-8")
for m in re.finditer(r'slug:\s*"([^"]+)"', text):
    slug = m.group(1)
    start = m.end()
    nxt = text.find("verses:", start)
    block = text[nxt:text.find("],\n  },", nxt)]
    times = [float(x) for x in re.findall(r"time:\s*([\d.]+)", block)]
    ok = all(b >= a for a, b in zip(times, times[1:]))
    print(slug, "OK" if ok else f"NON-MONO {times}")
