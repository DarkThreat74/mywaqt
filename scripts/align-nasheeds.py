# Forced-align nasheed audio against curated lyrics in src/lib/nasheeds.ts.
# Global sequence alignment (difflib) between all curated words and all
# whisper ASR words, then per-line interpolation between anchors.
# Reads ASR word dumps from scripts/out/<slug>-asr.json (or produces them).
import json, re, unicodedata, difflib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TS = ROOT / "src/lib/nasheeds.ts"
AUDIO = ROOT / "public/audio/nasheeds"
OUT = ROOT / "scripts/out"
OUT.mkdir(exist_ok=True)

SLUGS = ["qalbi-fi-al-madina", "subhanallah", "assubhu-bada", "insha-allah"]

def norm(w: str) -> str:
    w = unicodedata.normalize("NFKD", w)
    w = "".join(c for c in w if not unicodedata.combining(c))
    for a in ("أ", "إ", "آ", "ٱ"):
        w = w.replace(a, "ا")
    w = w.replace("ى", "ي").replace("ة", "ه").replace("ـ", "")
    w = re.sub(r"[^\w\s]", "", w, flags=re.UNICODE).strip().lower()
    return w

def parse_stanzas(text: str, slug: str):
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
    stanzas = []
    for lm in re.finditer(r"lines:\s*\[", block):
        ctx = block[max(0, lm.start() - 250):lm.start()]
        tm = re.findall(r"time:\s*([\d.]+)", ctx)
        orig_time = float(tm[-1]) if tm else None
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
        stanzas.append(None if lines == ["موسيقى"] else {"lines": lines, "time": orig_time})
    return stanzas

def transcribe(slug):
    cache = OUT / f"{slug}-asr.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    import subprocess, numpy as np
    from faster_whisper import WhisperModel
    model = WhisperModel("medium", device="cpu", compute_type="int8")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(AUDIO / f"{slug}.mp3"),
                          "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    pcm = np.frombuffer(raw, dtype=np.float32)
    segs, _ = model.transcribe(pcm, word_timestamps=True, language="ar")
    words = [{"word": w.word, "start": w.start}
             for s in segs for w in (s.words or [])]
    cache.write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
    return words

LOOKAHEAD = 90.0  # seconds of ASR to search for one stanza

def align_track(stanzas, asr_words, duration):
    asr_norm = [norm(w["word"]) for w in asr_words]
    result = [None] * len(stanzas)
    cursor = 0.0  # audio position where this stanza may start
    for si, st in enumerate(stanzas):
        if st is None:
            continue
        lines = st["lines"]
        cur = [norm(w) for l in lines for w in l.split()]
        # anchor the search window at the curated stanza `time` when present,
        # otherwise continue from the previous stanza's end.
        base = st["time"] if st["time"] is not None else cursor
        win_lo = max(cursor - 0.5, base - 3.0)
        n = len(cur)
        need = max(2, n // 3)

        def try_window(lo_t, hi_t):
            lo = next((i for i, w in enumerate(asr_words) if w["start"] >= lo_t), len(asr_words))
            hi = next((i for i in range(lo, len(asr_words)) if asr_words[i]["start"] > hi_t), len(asr_words))
            sl = asr_norm[lo:hi]
            sm = difflib.SequenceMatcher(None, cur, sl, autojunk=False)
            times = {}
            for a, b, size in sm.get_matching_blocks():
                for k in range(size):
                    times[a + k] = asr_words[lo + b + k]["start"]
            return times

        # tight window near expected position first; widen if too few anchors
        times = try_window(win_lo, base + 3.0 + 2.8 * n)
        if len(times) < need:
            times = try_window(win_lo, win_lo + LOOKAHEAD)
        # drop anchors that jump >12s past the previous one — a repeated
        # lyric matched a distant occurrence, not this stanza
        kept = {}
        prev_t = None
        for pos in sorted(times):
            t = times[pos]
            if prev_t is not None and t - prev_t > 12.0:
                break
            kept[pos] = t
            prev_t = t
        times = kept
        anchors = len(times)
        if anchors >= need:
            wt = []
            for pos in range(n):
                if pos in times:
                    wt.append(times[pos])
                    continue
                lp = next((p for p in range(pos - 1, -1, -1) if p in times), None)
                ln = next((p for p in range(pos + 1, n) if p in times), None)
                if lp is not None and ln is not None:
                    f = (pos - lp) / (ln - lp)
                    wt.append(times[lp] + f * (times[ln] - times[lp]))
                elif lp is not None:
                    wt.append(times[lp] + 0.4 * (pos - lp))
                else:
                    wt.append(max(cursor, times[ln] - 0.4 * (ln - pos)))
        else:
            # fallback: distribute across [start, bounded span]
            start = max(cursor, st["time"] if st["time"] is not None else cursor)
            step = 0.55
            wt = [start + i * step for i in range(n)]
        # enforce monotone + clamp to duration
        last = 0.0
        wt2 = []
        for t in wt:
            t = min(max(t, last), max(0.0, duration - 0.1))
            wt2.append(round(t, 1))
            last = t
        line_times, c = [], 0
        for line in lines:
            line_times.append(wt2[c])
            c += len(line.split())
        result[si] = {"lineTimes": line_times, "wordTimes": wt2}
        cursor = wt2[-1] + 0.3
    return result

def main():
    text = TS.read_text(encoding="utf-8")
    result = {}
    for slug in SLUGS:
        if not (AUDIO / f"{slug}.mp3").exists():
            continue
        stanzas = parse_stanzas(text, slug)
        asr = transcribe(slug)
        print(f"{slug}: {len(asr)} asr words, {sum(1 for s in stanzas if s)} lyric stanzas", flush=True)
        import subprocess
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries",
            "format=duration", "-of", "csv=p=0", str(AUDIO / f"{slug}.mp3")],
            capture_output=True, check=True, text=True).stdout.strip())
        result[slug] = align_track(stanzas, asr, dur)
        n_bad = sum(1 for a in result[slug] if a and a.get("unmatched"))
        print(f"  {n_bad} stanzas unmatched", flush=True)
    (OUT / "nasheed-align.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print("done")

if __name__ == "__main__":
    main()
