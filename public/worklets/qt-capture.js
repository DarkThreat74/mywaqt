// Quran Tester capture worklet — posts mono Float32 frames to its port.
// Served same-origin (public/worklets) because the CSP blocks blob: modules.
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) { const c = ch.slice(0); this.port.postMessage(c, [c.buffer]); }
    return true;
  }
}
registerProcessor("qt-capture", Capture);
