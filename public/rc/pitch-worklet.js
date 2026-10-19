// Recite-coach live pitch + spectral processor — McLeod Pitch Method (NSDF)
// inside the audio render thread, plus a 2048-pt FFT per analysis hop for
// spectral features (nasal-band ratio → ghunnah, spectral centroid, ZCR →
// voice quality/noise). Hop = 4 render quanta (~10.7ms @48k). Latency is the
// product: results postMessage out; the main thread only needs the latest
// value per animation frame, so queue jitter costs nothing visible.
const N = 2048;
const HOP_QUANTA = 4;
const FFT_MASK = N - 1;

// bit-reversal table + twiddles, built once at construction
const REV = new Uint16Array(N);
const TWR = new Float32Array(N / 2);
const TWI = new Float32Array(N / 2);
(function init() {
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    REV[i] = j;
  }
  for (let i = 0; i < N / 2; i++) {
    TWR[i] = Math.cos((2 * Math.PI * i) / N);
    TWI[i] = -Math.sin((2 * Math.PI * i) / N);
  }
})();

class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(N);
    this.write = 0;
    this.filled = 0;
    this.buf = new Float32Array(N);
    this.re = new Float32Array(N);
    this.im = new Float32Array(N);
    this.quantum = 0;
    this.noiseFloor = 1e-4;
    this.sr = sampleRate;
    this.tauMin = Math.floor(this.sr / 1000);
    this.tauMax = Math.min(Math.floor(this.sr / 65), N >> 1);
    this.r = new Float32Array(this.tauMax + 1);
    this.m = new Float32Array(this.tauMax + 1);
    this.clarityThresh = 0.82;
  }

  fftMag(bin) {
    const { re, im } = this;
    return Math.sqrt(re[bin] * re[bin] + im[bin] * im[bin]);
  }

  analyze() {
    const { ring, buf, sr } = this;
    const w = this.write;
    for (let i = 0; i < N; i++) buf[i] = ring[(w + i) & FFT_MASK];

    let e = 0, zc = 0;
    for (let i = 0; i < N; i++) {
      e += buf[i] * buf[i];
      if (i && buf[i] * buf[i - 1] < 0) zc++;
    }
    const rms = Math.sqrt(e / N);
    if (rms < this.noiseFloor * 4) this.noiseFloor = this.noiseFloor * 0.98 + rms * 0.02;
    const zcr = zc / N;

    // --- spectral features (only meaningful when voiced, but cheap always) ---
    const { re, im } = this;
    for (let i = 0; i < N; i++) { re[REV[i]] = buf[i]; im[i] = 0; }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let i = 0; i < N; i += size) {
        for (let k = 0; k < half; k++) {
          const tw = k * step;
          const or_ = re[i + k + half] * TWR[tw] - im[i + k + half] * TWI[tw];
          const oi = re[i + k + half] * TWI[tw] + im[i + k + half] * TWR[tw];
          re[i + k + half] = re[i + k] - or_;
          im[i + k + half] = im[i + k] - oi;
          re[i + k] += or_;
          im[i + k] += oi;
        }
      }
    }
    const binHz = sr / N;
    const lo = Math.max(1, Math.floor(180 / binHz));
    const hi = Math.min(N / 2 - 1, Math.ceil(3400 / binHz));
    let tot = 0, csum = 0, nasal = 0;
    const nasalLo = Math.floor(220 / binHz), nasalHi = Math.ceil(380 / binHz);
    for (let b = lo; b <= hi; b++) {
      const mag = this.fftMag(b);
      tot += mag;
      csum += mag * b * binHz;
      if (b >= nasalLo && b <= nasalHi) nasal += mag;
    }
    const centroid = tot > 0 ? csum / tot : 0;
    const nasalRatio = tot > 0 ? nasal / tot : 0;

    // --- MPM / NSDF ---
    const { r, m, tauMin, tauMax } = this;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      let ac = 0, mm = 0;
      for (let j = 0; j < N - tau; j++) {
        const a = buf[j], b = buf[j + tau];
        ac += a * b;
        mm += a * a + b * b;
      }
      r[tau] = ac;
      m[tau] = mm;
    }
    let maxPeak = 0;
    const peaks = [];
    for (let tau = tauMin + 1; tau < tauMax; tau++) {
      const mm = m[tau];
      const v = mm > 0 ? (2 * r[tau]) / mm : 0;
      const pv = m[tau - 1] > 0 ? (2 * r[tau - 1]) / m[tau - 1] : 0;
      const nv = m[tau + 1] > 0 ? (2 * r[tau + 1]) / m[tau + 1] : 0;
      if (v > 0 && v >= pv && v > nv) {
        peaks.push(tau);
        if (v > maxPeak) maxPeak = v;
      }
    }
    let hz = 0, clarity = 0;
    if (peaks.length && maxPeak > 0.3) {
      let pick = peaks[peaks.length - 1];
      for (const tau of peaks) {
        const v = (2 * r[tau]) / m[tau];
        if (v >= maxPeak * this.clarityThresh) { pick = tau; break; }
      }
      const a = (2 * r[pick - 1]) / m[pick - 1];
      const b = (2 * r[pick]) / m[pick];
      const c = (2 * r[pick + 1]) / m[pick + 1];
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
      hz = sr / (pick + shift * 0.5);
      clarity = b;
    }
    return { hz, clarity, rms, noiseFloor: this.noiseFloor, zcr, centroid, nasalRatio };
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      const n = ch.length;
      for (let i = 0; i < n; i++) this.ring[(this.write + i) & FFT_MASK] = ch[i];
      this.write = (this.write + n) & FFT_MASK;
      this.filled = Math.min(this.filled + n, N);
      if (++this.quantum >= HOP_QUANTA && this.filled === N) {
        this.quantum = 0;
        const out = this.analyze();
        out.t = currentTime;
        this.port.postMessage(out);
      }
    }
    return true;
  }
}

registerProcessor("rc-pitch", PitchProcessor);
