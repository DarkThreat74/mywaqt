# Inject lineTimes/wordTimes from scripts/out/nasheed-align.json into
# src/lib/nasheeds.ts, updating each stanza's `time` to its first lineTime.
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TS = ROOT / "src/lib/nasheeds.ts"
ALIGN = json.loads((ROOT / "scripts/out/nasheed-align.json").read_text(encoding="utf-8"))

def fmt(arr):
    return "[" + ", ".join(f"{x:g}" for x in arr) + "]"

text = TS.read_text(encoding="utf-8")

for slug, stanzas in ALIGN.items():
    i = text.index(f'slug: "{slug}"')
    j = text.index("verses:", i)
    k = text.index("[", j)
    depth, end = 0, k
    for m in range(k, len(text)):
        if text[m] == "[": depth += 1
        elif text[m] == "]":
            depth -= 1
            if depth == 0:
                end = m
                break
    block = text[k:end]
    # drop any lineTimes/wordTimes from previous runs first
    block = re.sub(r"\n\s*lineTimes:\s*\[[^\]]*\],", "", block)
    block = re.sub(r"\n\s*wordTimes:\s*\[[^\]]*\],", "", block)
    out, last, si = [], 0, 0
    for lm in re.finditer(r"lines:\s*\[", block):
        s = lm.end()
        d, e = 0, s - 1
        for m in range(s - 1, len(block)):
            if block[m] == "[": d += 1
            elif block[m] == "]":
                d -= 1
                if d == 0:
                    e = m
                    break
        arr = block[s - 1:e + 1]
        lines = re.findall(r'"((?:[^"\\]|\\.)*)"', arr)
        a = stanzas[si] if si < len(stanzas) else None
        aligned = a and "lineTimes" in a and lines != ["موسيقى"]
        # header chunk between previous lines-array end and this `lines:` —
        # rewrite its last `time: N` to the aligned start
        header = block[last:lm.start()]
        if aligned:
            t = a["lineTimes"][0]
            def repl(mm, t=t):
                return mm.group(1) + f"{t:g}"
            header = re.sub(r"(time:\s*)[\d.]+", repl, header, count=1)
        out.append(header)
        out.append(block[lm.start():e + 1])
        if aligned:
            out.append(f",\n        lineTimes: {fmt(a['lineTimes'])},"
                       f"\n        wordTimes: {fmt(a['wordTimes'])}")
        last = e + 1
        si += 1
    out.append(block[last:])
    text = text[:k] + "".join(out) + text[end:]

TS.write_text(text, encoding="utf-8")
print("patched")
