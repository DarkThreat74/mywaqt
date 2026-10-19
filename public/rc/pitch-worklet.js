// Recite-coach live pitch processor — McLeod Pitch Method (NSDF) run inside
// the audio render thread. Latency is the product: every analysis hops on ~4
// render quanta (~10.7ms @48k) over a 2048-sample ring buffer (2+ periods at
// 85Hz). Results go out by postMessage; the main thread only ever needs the
// latest value per animation frame, so queue jitter costs nothing visible.
const N = 2048;
const HOP_QUANTA = 4; // analyze every 4th render quantum (~10.7ms @48kHz)

class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(N);
    this.write = 0;
    this.filled = 0;
    this.buf = new Float32Array(N); // contiguous copy for analysis
    this.nsdfR = new Float32Array(0);
    this.quantum = 0;
    this.noiseFloor = 1e-4;
    this.sr = sampleRate;
    this.tauMin = Math.floor(this.sr / 1000); // 1000 Hz ceiling
    this.tauMax = Math.min(Math.floor(this.sr / 65), N >> 1); // 65 Hz floor
    this.r = new Float32Array(this.tauMax + 1);
    this.m = new Float32Array(this.tauMax + 1);
    this.clarityThresh = 0.82; // first NSDF peak above this × max wins
  }

  analyze() {
    const { ring, buf, sr } = this;
    const w = this.write;
    for (let i = 0; i < N; i++) buf[i] = ring[(w + i) & (N - 1)];

    let e = 0;
    for (let i = 0; i < N; i++) e += buf[i] * buf[i];
    const rms = Math.sqrt(e / N);
    // slow-adapting noise floor: only ratchet up on quiet frames
    if (rms < this.noiseFloor * 4) this.noiseFloor = this.noiseFloor * 0.98 + rms * 0.02;

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
    // NSDF' = 2r/m; collect local maxima, pick the FIRST strong one (kills octave errors)
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
      // parabolic interpolation on the NSDF peak
      const a = (2 * r[pick - 1]) / m[pick - 1];
      const b = (2 * r[pick]) / m[pick];
      const c = (2 * r[pick + 1]) / m[pick + 1];
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
      const tau = pick + shift * 0.5;
      hz = sr / tau;
      clarity = b;
    }
    return { hz, clarity, rms, noiseFloor: this.noiseFloor };
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      const n = ch.length;
      for (let i = 0; i < n; i++) this.ring[(this.write + i) & (N - 1)] = ch[i];
      this.write = (this.write + n) & (N - 1);
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
