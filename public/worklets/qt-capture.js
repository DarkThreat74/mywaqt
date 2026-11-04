// Quran Tester capture worklet — posts mono Float32 frames to its port.
// Served same-origin (public/worklets) because the CSP blocks blob: modules.
class Capture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const ring = options.processorOptions && options.processorOptions.audioRing;
    this.header = ring ? new Int32Array(ring, 0, 2) : null;
    this.samples = ring ? new Float32Array(ring, 8) : null;
    this.capacity = this.samples ? this.samples.length : 0;
    this.pending = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || !ch.length) return true;
    if (!this.samples) {
      const c = ch.slice(0);
      this.port.postMessage(c, [c.buffer]);
      return true;
    }
    let write = Atomics.load(this.header, 1);
    let read = Atomics.load(this.header, 0);
    for (let i = 0; i < ch.length; i++) {
      const next = (write + 1) % this.capacity;
      if (next === read) read = (read + 1) % this.capacity;
      this.samples[write] = ch[i];
      write = next;
    }
    Atomics.store(this.header, 0, read);
    Atomics.store(this.header, 1, write);
    this.pending += ch.length;
    if (this.pending >= sampleRate / 12.5) {
      this.pending = 0;
      this.port.postMessage({ type: "audio-ring" });
    }
    return true;
  }
}
registerProcessor("qt-capture", Capture);
