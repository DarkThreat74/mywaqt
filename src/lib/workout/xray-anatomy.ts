/**
 * Real x-ray anatomy engine — a TypeScript port of the "X-Ray Mirror" single-file
 * app (BodyParts3D mesh data, CC BY-SA 2.1). Renders a real skull/brain/facial
 * muscles/eye model pinned to MediaPipe FaceLandmarker output, plus articulated
 * hand bones from HandLandmarker. The head pose is auto-fit to the screen by
 * least-squares comparing projected model points with tracked landmarks.
 */
import type * as ThreeNS from "three";

export type THREE = typeof import("three");

// ── data types ──
export interface MeshMeta {
  name: string; nv: number; ni: number;
  min: number[]; size: number[]; offV: number; offI: number;
}
export interface XRayMeta {
  labels: { t: string; layer: string; jaw: number; pts: number[][] }[];
  meshes: MeshMeta[];
  jawPivot: number[];
  fit: Record<string, number[]>;
}
export interface XRaySettings {
  skull: boolean; brain: boolean; muscles: boolean; eyes: boolean;
  outline: boolean; hands: boolean; labels: boolean;
  style: "xray" | "solid";
  reveal: "full" | "lens" | "left" | "right" | "top" | "bottom";
  bright: number; real: number; feather: number; cut: number;
}

type Vec3 = InstanceType<THREE["Vector3"]>;
type Mat4 = InstanceType<THREE["Matrix4"]>;
export type Lm = { x: number; y: number; z?: number };

const BONES: [number, number][] = [[1,2],[2,3],[3,4],[5,6],[6,7],[7,8],[9,10],[10,11],[11,12],[13,14],[14,15],[15,16],[17,18],[18,19],[19,20]];
const LABEL_COLOR: Record<string, string> = { skull: "#d9f0ff", brain: "#ffc2d6", muscles: "#ffb3aa", eyes: "#fff3a8", hands: "#d9f0ff" };
const HEAD_C = [0, 3.2, -4.8];
const XRAY_GAIN: Record<string, number> = { outline: 0.55, muscles: 0.5, cerebrum: 0.36, hindbrain: 0.6, eyes: 0.9 };

const VERT = `
uniform mat4 uToHead; uniform float uOrtho;
varying vec3 vN; varying vec3 vV; varying vec3 vL;
void main() {
  vL = (uToHead * vec4(position, 1.0)).xyz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform vec3 uColor; uniform vec3 uSolidColor;
uniform float uOpacity, uGain, uMode, uClipOn, uFade, uFeather, uCutSoft; uniform vec4 uClip;
varying vec3 vN; varying vec3 vV; varying vec3 vL;
void main() {
  float soft = 1.0;
  if (uClipOn > 0.5) {
    float dcut = dot(uClip.xyz, vL) - uClip.w;
    if (dcut < 0.0) discard;
    if (uCutSoft > 0.001) soft *= smoothstep(0.0, uCutSoft, dcut);
  }
  vec3 n = normalize(vN);
  float ndv = abs(dot(n, normalize(vV)));
  if (uFeather > 0.001) soft *= smoothstep(0.0, uFeather, ndv);
  float fade = uFade > 0.5 ? smoothstep(-12.4, -9.2, vL.y) : 1.0;
  if (uMode > 1.5) {
    gl_FragColor = vec4(uColor, uOpacity * fade * soft);
  } else if (uMode > 0.5) {
    vec3 fn = gl_FrontFacing ? n : -n;
    float d = max(dot(fn, normalize(vec3(0.35, 0.55, 0.76))), 0.0);
    float rim = pow(1.0 - ndv, 2.5);
    gl_FragColor = vec4(uSolidColor * (0.28 + 0.78 * d) * uGain + vec3(0.25) * rim, uOpacity * soft);
  } else {
    float rim = pow(1.0 - ndv, 2.1);
    float a = clamp((0.035 + 0.95 * rim) * uGain * uOpacity * fade, 0.0, 1.0);
    gl_FragColor = vec4(uColor, a * soft);
  }
}`;

interface MeshEntry { mesh: ThreeNS.Mesh; layer: string; fixedMode?: number }
interface HandRig { group: ThreeNS.Group; palm: ThreeNS.Mesh; bones: ThreeNS.Mesh[]; pts: Vec3[] | null }
type ShaderU = { value: unknown };
interface Uniforms {
  uColor: ShaderU; uSolidColor: ShaderU; uOpacity: ShaderU; uGain: ShaderU;
  uMode: ShaderU; uOrtho: ShaderU; uFade: ShaderU; uFeather: ShaderU;
  uCutSoft: ShaderU; uClipOn: ShaderU; uClip: ShaderU; uToHead: ShaderU;
}

export class XRayEngine {
  private T: THREE;
  private meta: XRayMeta;
  W = 640; H = 480;
  S: XRaySettings = {
    skull: true, brain: false, muscles: false, eyes: true, outline: true,
    hands: true, labels: false, style: "xray", reveal: "full",
    bright: 1, real: 0.25, feather: 0.2, cut: 0.5,
  };
  mirror = true;

  private renderer!: ThreeNS.WebGLRenderer;
  private headScene!: ThreeNS.Scene; private handScene!: ThreeNS.Scene;
  private cam!: ThreeNS.PerspectiveCamera; private ortho!: ThreeNS.OrthographicCamera;
  private headGroup!: ThreeNS.Group; private jawPivot!: ThreeNS.Group;
  private baseProj!: Mat4;
  private meshes: Record<string, MeshEntry> = {};
  private handRigs: HandRig[] = [];

  private head = {
    found: false,
    pos: null as Vec3 | null, quat: null as InstanceType<THREE["Quaternion"]> | null,
    scl: null as Vec3 | null, fitS: 1, fitX: 0, fitY: 0, jaw: 0,
  };
  private tmpM!: Mat4; private tmpP!: Vec3; private tmpQ!: InstanceType<THREE["Quaternion"]>;
  private tmpS!: Vec3; private tmpV!: Vec3; private fitM!: Mat4; private corr!: Mat4; private jawM!: Mat4;
  private lp!: Vec3; private ln!: Vec3; private lc!: Vec3;
  private vA!: Vec3; private vB!: Vec3; private vC!: Vec3;
  private e1!: Vec3; private e2!: Vec3; private e3!: Vec3; private hm!: Mat4;
  private FIT_IDS: number[];
  private clipState = { on: 0, x: 1, y: 0, w: 0 };
  private frameNo = 0;
  private headSplit = 0;
  private labelState: Record<string, { side: string; wy?: number; rank?: number; rankSide?: string; seen: number }> = {};
  private veilScratch: HTMLCanvasElement | null = null;

  constructor(T: THREE, meta: XRayMeta) {
    this.T = T;
    this.meta = meta;
    this.FIT_IDS = Object.keys(meta.fit).map(Number);
  }

  /** Decode the quantized mesh blob (base64) into BufferGeometries. */
  private decodeMeshes(b64: string): Record<string, ThreeNS.BufferGeometry> {
    const T = this.T;
    const bin = atob(b64.trim());
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const out: Record<string, ThreeNS.BufferGeometry> = {};
    for (const m of this.meta.meshes) {
      const q = new Uint16Array(u8.buffer, m.offV, m.nv * 3);
      const pos = new Float32Array(m.nv * 3);
      for (let i = 0; i < q.length; i++) pos[i] = m.min[i % 3] + (q[i] / 65535) * m.size[i % 3];
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(pos, 3));
      geo.setIndex(new T.BufferAttribute(new Uint16Array(u8.buffer, m.offI, m.ni).slice(), 1));
      geo.computeVertexNormals();
      out[m.name] = geo;
    }
    return out;
  }

  private makeMat(xray: number, solid: number, mode: number): ThreeNS.ShaderMaterial {
    const T = this.T;
    return new T.ShaderMaterial({
      uniforms: {
        uColor: { value: new T.Color(xray) }, uSolidColor: { value: new T.Color(solid) },
        uOpacity: { value: 1 }, uGain: { value: 1 }, uMode: { value: mode || 0 },
        uOrtho: { value: 0 }, uFade: { value: 0 }, uFeather: { value: 0 }, uCutSoft: { value: 0 },
        uClipOn: { value: 0 }, uClip: { value: new T.Vector4(1, 0, 0, 0) },
        uToHead: { value: new T.Matrix4() },
      },
      vertexShader: VERT, fragmentShader: FRAG, side: T.DoubleSide, transparent: true,
      depthTest: false, depthWrite: false,
      blending: mode === 2 ? T.NormalBlending : T.AdditiveBlending,
    });
  }

  build(glCanvas: HTMLCanvasElement, b64: string) {
    const T = this.T;
    this.tmpM = new T.Matrix4(); this.tmpP = new T.Vector3(); this.tmpQ = new T.Quaternion();
    this.tmpS = new T.Vector3(); this.tmpV = new T.Vector3(); this.fitM = new T.Matrix4();
    this.corr = new T.Matrix4(); this.jawM = new T.Matrix4();
    this.lp = new T.Vector3(); this.ln = new T.Vector3(); this.lc = new T.Vector3();
    this.vA = new T.Vector3(); this.vB = new T.Vector3(); this.vC = new T.Vector3();
    this.e1 = new T.Vector3(); this.e2 = new T.Vector3(); this.e3 = new T.Vector3();
    this.hm = new T.Matrix4();
    this.head.pos = new T.Vector3(); this.head.quat = new T.Quaternion(); this.head.scl = new T.Vector3(1, 1, 1);

    this.renderer = new T.WebGLRenderer({ canvas: glCanvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.headScene = new T.Scene();
    this.handScene = new T.Scene();
    // MediaPipe places the face for a camera with a 63° vertical FOV.
    this.cam = new T.PerspectiveCamera(63, this.W / this.H, 1, 10000);
    this.ortho = new T.OrthographicCamera(0, this.W, this.H, 0, -5000, 5000);
    const geos = this.decodeMeshes(b64);

    this.headGroup = new T.Group();
    this.headGroup.matrixAutoUpdate = false;
    this.headGroup.visible = false;
    this.headScene.add(this.headGroup);
    this.jawPivot = new T.Group();
    this.jawPivot.position.fromArray(this.meta.jawPivot);
    this.headGroup.add(this.jawPivot);

    const add = (name: string, geo: ThreeNS.BufferGeometry, layer: string, xray: number, solid: number, order: number, parent?: ThreeNS.Group, mode?: number) => {
      const mesh = new T.Mesh(geo, this.makeMat(xray, solid, mode ?? 0));
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      (parent ?? this.headGroup).add(mesh);
      this.meshes[name] = { mesh, layer, fixedMode: mode };
      return mesh;
    };
    (add("veil", geos.skin, "veil", 0x04070d, 0x04070d, -10, undefined, 2).material as ThreeNS.ShaderMaterial).uniforms.uFade.value = 1;
    (add("outline", geos.skin, "outline", 0x6fb6ff, 0x6fb6ff, 1, undefined, 0).material as ThreeNS.ShaderMaterial).uniforms.uFade.value = 1;
    add("muscles", geos.muscles, "muscles", 0xff6b5e, 0xb5453c, 2);
    add("cranium", geos.cranium, "skull", 0xbfe3ff, 0xe9e2cf, 3);
    const jaw = add("jaw", geos.jaw, "skull", 0xbfe3ff, 0xe9e2cf, 3, this.jawPivot);
    jaw.position.fromArray(this.meta.jawPivot).multiplyScalar(-1);
    add("eyes", geos.eyes, "eyes", 0xfff3a8, 0xf4f4ee, 4);
    add("cerebrum", geos.cerebrum, "brain", 0xff9fc0, 0xe2a39d, 5);
    add("hindbrain", geos.hindbrain, "brain", 0xffc37a, 0xd6ad84, 5);

    for (let h = 0; h < 2; h++) {
      const group = new T.Group();
      group.visible = false;
      this.handScene.add(group);
      const mk = (geo: ThreeNS.BufferGeometry) => {
        const m = new T.Mesh(geo, this.makeMat(0xd9f0ff, 0xe9e2cf, 0));
        (m.material as ThreeNS.ShaderMaterial).uniforms.uOrtho.value = 1;
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        group.add(m);
        return m;
      };
      this.handRigs.push({
        group, palm: mk(geos.hand_palm),
        bones: BONES.map(([a, b]) => mk(geos[`hand_b_${a}_${b}`])), pts: null,
      });
    }
    this.applyStyle();
  }

  resize(W: number, H: number) {
    this.W = Math.max(2, Math.round(W));
    this.H = Math.max(2, Math.round(H));
    if (!this.renderer) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.W, this.H, false);
    this.cam.aspect = this.W / this.H;
    this.cam.updateProjectionMatrix();
    this.baseProj = this.cam.projectionMatrix.clone();
    this.ortho.right = this.W; this.ortho.top = this.H;
    this.ortho.updateProjectionMatrix();
  }

  private eachMat(fn: (m: ThreeNS.ShaderMaterial, info: { layer: string; fixedMode?: number }) => void) {
    for (const k in this.meshes) fn(this.meshes[k].mesh.material as ThreeNS.ShaderMaterial, this.meshes[k]);
    for (const r of this.handRigs) {
      fn(r.palm.material as ThreeNS.ShaderMaterial, { layer: "hands" });
      for (const b of r.bones) fn(b.material as ThreeNS.ShaderMaterial, { layer: "hands" });
    }
  }

  applyStyle() {
    if (!this.renderer) return;
    const solid = this.S.style === "solid";
    const T = this.T;
    this.eachMat((m, info) => {
      if (info.fixedMode !== undefined) return;
      m.uniforms.uMode.value = solid ? 1 : 0;
      m.blending = solid ? T.NormalBlending : T.AdditiveBlending;
      m.depthTest = solid; m.depthWrite = solid; m.needsUpdate = true;
    });
  }

  /** Pin the head model to the tracked face: smooth the pose, then solve the
   *  best screen-space scale+offset between projected model points and the
   *  landmarks the tracker saw. */
  updateHead(matrixData: number[] | Float32Array, lms: Lm[], jawOpen: number) {
    const tmpM = this.tmpM.fromArray(matrixData as number[]);
    const e = tmpM.elements;
    if (Math.abs(e[12]) + Math.abs(e[13]) + Math.abs(e[14]) < 1e-6 &&
        Math.abs(e[3]) + Math.abs(e[7]) + Math.abs(e[11]) > 1e-3) tmpM.transpose();
    this.applyHeadPose(tmpM, lms, jawOpen);
  }

  /** Matrix-free head pose — for when the tracker's face-geometry solver
   *  keeps crashing (partially-cropped faces). Places the model at a fixed
   *  depth with a scale inferred from the face's screen width; the same
   *  auto-fit correction then pins it to the real landmarks. */
  updateHeadApprox(lms: Lm[], jawOpen: number) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of lms) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    const faceW = x1 - x0;
    if (!(faceW > 0.02)) return;
    const Z = 45; // cm — tracker sits heads roughly here
    const pe = this.baseProj.elements;   // pe[0] = 1/(tan·aspect), pe[5] = 1/tan
    // Model ear-to-ear span is ~15.3cm (fit pts 234/454 at x=±7.66).
    const modelNdcW = (15.3 * pe[0]) / Z;
    const s = Math.max(0.3, Math.min(3, faceW / (modelNdcW || 1e-6)));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const wx = (cx * 2 - 1) * (Z / pe[0]);
    const wy = (1 - cy * 2) * (Z / pe[5]);
    this.tmpP.set(wx - HEAD_C[0] * s, wy - HEAD_C[1] * s, -Z);
    this.tmpQ.identity();
    this.tmpS.set(s, s, s);
    this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
    this.applyHeadPose(this.tmpM, lms, jawOpen);
  }

  private applyHeadPose(tmpM: Mat4, lms: Lm[], jawOpen: number) {
    const head = this.head;
    tmpM.decompose(this.tmpP, this.tmpQ, this.tmpS);
    if (!head.found) {
      head.pos!.copy(this.tmpP); head.quat!.copy(this.tmpQ); head.scl!.copy(this.tmpS);
      head.fitS = 1; head.fitX = head.fitY = 0;
    } else {
      head.pos!.lerp(this.tmpP, 0.6); head.quat!.slerp(this.tmpQ, 0.55); head.scl!.lerp(this.tmpS, 0.5);
    }
    head.found = true;
    head.jaw += (jawOpen - head.jaw) * 0.6;
    tmpM.compose(head.pos!, head.quat!, head.scl!);

    let pmx = 0, pmy = 0, qmx = 0, qmy = 0;
    const P: number[][] = [], Q: number[][] = [];
    for (const id of this.FIT_IDS) {
      this.tmpV.fromArray(this.meta.fit[id]).applyMatrix4(tmpM).applyMatrix4(this.baseProj);
      const q = lms[id]; if (!q) continue;
      P.push([this.tmpV.x, this.tmpV.y]);
      Q.push([q.x * 2 - 1, 1 - q.y * 2]);
    }
    const n = P.length;
    for (let i = 0; i < n; i++) { pmx += P[i][0]; pmy += P[i][1]; qmx += Q[i][0]; qmy += Q[i][1]; }
    pmx /= n; pmy /= n; qmx /= n; qmy /= n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      const ax = P[i][0] - pmx, ay = P[i][1] - pmy;
      num += ax * (Q[i][0] - qmx) + ay * (Q[i][1] - qmy);
      den += ax * ax + ay * ay;
    }
    const s = Math.max(0.6, Math.min(1.6, den > 1e-9 ? num / den : 1));
    head.fitS += (s - head.fitS) * 0.5;
    head.fitX += (qmx - head.fitS * pmx - head.fitX) * 0.7;
    head.fitY += (qmy - head.fitS * pmy - head.fitY) * 0.7;
    this.corr.set(head.fitS, 0, 0, head.fitX, 0, head.fitS, 0, head.fitY, 0, 0, 1, 0, 0, 0, 0, 1);
    this.cam.projectionMatrix.copy(this.baseProj).premultiply(this.corr);
    this.cam.projectionMatrixInverse.copy(this.cam.projectionMatrix).invert();

    this.headGroup.matrix.copy(tmpM);
    this.headGroup.matrixWorldNeedsUpdate = true;
    this.headGroup.visible = true;
    this.jawPivot.rotation.x = Math.min(1, Math.max(0, head.jaw)) * 0.36;
  }

  headLost() { this.head.found = false; }
  get headVisible() { return this.head.found && this.headGroup?.visible; }

  /** Update one hand rig from 21 landmarks (video-normalized coords). */
  updateHand(rig: HandRig, lms: Lm[], isRight: boolean) {
    const W = this.W, H = this.H, tmpV = this.tmpV;
    if (!rig.pts) rig.pts = lms.map(() => new this.T.Vector3());
    const fresh = !rig.group.visible;
    lms.forEach((p, i) => {
      tmpV.set(p.x * W, (1 - p.y) * H, -(p.z ?? 0) * W);
      if (fresh) rig.pts![i].copy(tmpV); else rig.pts![i].lerp(tmpV, 0.65);
    });
    const P = rig.pts, sign = isRight ? 1 : -1;
    this.e1.subVectors(P[5], P[0]); this.e2.subVectors(P[17], P[0]);
    this.e3.crossVectors(this.e1, this.e2).normalize().multiplyScalar(sign * Math.sqrt(this.e1.length() * this.e2.length()));
    rig.palm.matrix.makeBasis(this.e1, this.e2, this.e3).setPosition(P[0].x, P[0].y, P[0].z);
    rig.palm.matrixWorldNeedsUpdate = true;
    this.vC.subVectors(P[17], P[5]).normalize();
    BONES.forEach(([a, b], i) => {
      this.vA.subVectors(P[b], P[a]);
      let len = this.vA.length(); if (len < 1e-6) len = 1e-6;
      this.vA.divideScalar(len);
      this.vB.copy(this.vC).addScaledVector(this.vA, -this.vC.dot(this.vA));
      if (this.vB.lengthSq() < 1e-6) this.vB.set(1, 0, 0);
      this.vB.normalize();
      this.e3.crossVectors(this.vA, this.vB).multiplyScalar(sign);
      const L = len * (b % 4 === 0 ? 0.8 : 1);
      this.hm.makeBasis(
        this.e1.copy(this.vA).multiplyScalar(L),
        this.e2.copy(this.vB).multiplyScalar(L),
        this.e3.multiplyScalar(L),
      ).setPosition(P[a].x, P[a].y, P[a].z);
      rig.bones[i].matrix.copy(this.hm);
      rig.bones[i].matrixWorldNeedsUpdate = true;
    });
    rig.group.visible = true;
  }

  /** Dark veil behind hand bones so they read against the real hand. Drawn in
   *  unmirrored space — CSS flips the shade canvas together with the video. */
  drawHandVeil(g: CanvasRenderingContext2D, lms: Lm[], alpha: number) {
    const W = this.W, H = this.H;
    const px = (i: number) => lms[i].x * W, py = (i: number) => lms[i].y * H;
    const d = Math.hypot(px(5) - px(17), py(5) - py(17)) || 1;
    const sc = this.veilScratch ?? (this.veilScratch = document.createElement("canvas"));
    if (sc.width !== W || sc.height !== H) { sc.width = W; sc.height = H; }
    const s = sc.getContext("2d")!;
    s.clearRect(0, 0, W, H);
    s.fillStyle = s.strokeStyle = "#04070d";
    s.lineJoin = s.lineCap = "round";
    const path = new Path2D();
    [0, 1, 2, 5, 9, 13, 17].forEach((i, k) => k ? path.lineTo(px(i), py(i)) : path.moveTo(px(i), py(i)));
    path.closePath();
    const fingers = new Path2D();
    for (const c of [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]])
      c.forEach((i, k) => k ? fingers.lineTo(px(i), py(i)) : fingers.moveTo(px(i), py(i)));
    s.lineWidth = d * 0.34; s.fill(path); s.stroke(path);
    s.lineWidth = d * 0.36; s.stroke(fingers);
    const blur = this.S.feather * d * 0.22;
    g.filter = blur > 0.5 ? `blur(${blur.toFixed(1)}px)` : "none";
    g.globalAlpha = alpha; g.drawImage(sc, 0, 0); g.globalAlpha = 1; g.filter = "none";
  }

  private applyLayers() {
    const S = this.S;
    let clipOn = 0, cx = 1, cy = 0, cw = 0;
    const cz = 0;
    if (S.reveal === "left")   { clipOn = 1; cx = 1;  cy = 0; cw = (S.cut - 0.5) * 16; }
    if (S.reveal === "right")  { clipOn = 1; cx = -1; cy = 0; cw = (S.cut - 0.5) * 16; }
    if (S.reveal === "top")    { clipOn = 1; cx = 0; cy = 1;  cw = -9 + (1 - S.cut) * 22; }
    if (S.reveal === "bottom") { clipOn = 1; cx = 0; cy = -1; cw = -(-9 + S.cut * 22); }
    this.clipState = { on: clipOn, x: cx, y: cy, w: cw };
    this.jawPivot.updateMatrix();
    this.meshes.jaw.mesh.updateMatrix();
    this.jawM.copy(this.jawPivot.matrix).multiply(this.meshes.jaw.mesh.matrix);
    const heavy = (S.skull ? 1 : 0) + (S.brain ? 1 : 0) + (S.muscles ? 1 : 0);
    const share = 1 / (0.4 + 0.6 * Math.max(1, heavy));
    for (const k in this.meshes) {
      const { mesh, layer } = this.meshes[k];
      const u = (mesh.material as ThreeNS.ShaderMaterial).uniforms as unknown as Uniforms;
      mesh.visible = layer === "veil" ? true : !!(S as unknown as Record<string, boolean>)[layer];
      (u.uGain as { value: number }).value =
        (S.style === "solid" && k !== "outline")
          ? Math.min(1.25, 0.6 + 0.4 * S.bright)
          : S.bright * (XRAY_GAIN[k] || 1) * (layer === "outline" ? 1 : share);
      (u.uOpacity as { value: number }).value = layer === "veil" ? 1 - S.real : 1;
      (u.uClipOn as { value: number }).value = clipOn;
      (u.uClip.value as InstanceType<THREE["Vector4"]>).set(cx, cy, cz, cw);
      (u.uFeather as { value: number }).value = S.feather * 0.75;
      (u.uCutSoft as { value: number }).value = S.feather * 5;
      if (k === "jaw") (u.uToHead.value as Mat4).copy(this.jawPivot.matrix).multiply(mesh.matrix);
      else (u.uToHead.value as Mat4).identity();
    }
  }

  /** Head-space point → HUD pixels. The GL canvas is CSS-mirrored on the front
   *  camera, so HUD coordinates flip x only when mirroring. */
  private toScreen(v: Vec3): { x: number; y: number } {
    this.lc.copy(v).applyMatrix4(this.cam.projectionMatrix);
    const x = (this.lc.x + 1) / 2 * this.W;
    return { x: this.mirror ? this.W - x : x, y: (1 - this.lc.y) / 2 * this.H };
  }

  private collectHeadLabels(lens: { x: number; y: number; r: number } | null) {
    const S = this.S, out: { text: string; color: string; ax: number; ay: number; facing: number }[] = [];
    const solid = S.style === "solid", M = this.headGroup.matrix;
    for (const L of this.meta.labels) {
      if (!(S as unknown as Record<string, boolean>)[L.layer]) continue;
      if (solid && S.muscles && (L.layer === "skull" || L.layer === "brain")) continue;
      if (solid && S.skull && L.layer === "brain") continue;
      let best: { text: string; color: string; ax: number; ay: number; facing: number } | null = null;
      for (const p of L.pts) {
        this.lp.fromArray(p);
        if (L.jaw) this.lp.applyMatrix4(this.jawM);
        if (this.clipState.on && this.clipState.x * this.lp.x + this.clipState.y * this.lp.y < this.clipState.w) continue;
        this.ln.set(this.lp.x - HEAD_C[0], this.lp.y - HEAD_C[1], this.lp.z - HEAD_C[2]).transformDirection(M);
        this.lp.applyMatrix4(M);
        const facing = -(this.ln.x * this.lp.x + this.ln.y * this.lp.y + this.ln.z * this.lp.z) / (this.lp.length() || 1);
        if (solid && facing < 0.12) continue;
        const s = this.toScreen(this.lp);
        if (lens && Math.hypot(s.x - lens.x, s.y - lens.y) > lens.r) continue;
        if (!best || facing > best.facing) best = { text: L.t, color: LABEL_COLOR[L.layer], ax: s.x, ay: s.y, facing };
      }
      if (best) out.push(best);
    }
    return out;
  }

  private layoutLabels(
    g: CanvasRenderingContext2D,
    items: { text: string; color: string; ax: number; ay: number; st?: { side: string; wy?: number; rank?: number; rankSide?: string; seen: number } }[],
    cx: number, halfWidth: number, key: string, splitX?: number,
  ) {
    if (splitX === undefined) splitX = cx;
    const cols: Record<string, typeof items> = { left: [], right: [] };
    for (const it of items) {
      const st = this.labelState[key + it.text] ??
        (this.labelState[key + it.text] = { side: it.ax < splitX ? "left" : "right", seen: 0 });
      if (st.side === "left" && it.ax > splitX + halfWidth * 0.15) st.side = "right";
      else if (st.side === "right" && it.ax < splitX - halfWidth * 0.15) st.side = "left";
      it.st = st; cols[st.side].push(it);
    }
    g.font = "600 12.5px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    g.textBaseline = "middle"; g.lineJoin = "round";
    for (const side of ["left", "right"] as const) {
      const list = cols[side], gap = 18;
      for (const it of list) {
        const st = it.st!;
        if (st.wy === undefined || this.frameNo - st.seen > 3) { st.wy = it.ay; st.rank = undefined; }
        else st.wy += (it.ay - st.wy) * 0.5;
        st.seen = this.frameNo;
      }
      list.sort((p, q) =>
        (p.st!.rank === undefined || q.st!.rank === undefined || p.st!.side !== p.st!.rankSide || q.st!.side !== q.st!.rankSide)
          ? p.st!.wy! - q.st!.wy! : p.st!.rank - q.st!.rank);
      for (let swapped = true, guard = 0; swapped && guard < 40; guard++) {
        swapped = false;
        for (let i = 0; i + 1 < list.length; i++)
          if (list[i].st!.wy! > list[i + 1].st!.wy! + 7) {
            const tmp = list[i]; list[i] = list[i + 1]; list[i + 1] = tmp; swapped = true;
          }
      }
      list.forEach((it, i) => { it.st!.rank = i; it.st!.rankSide = side; });
      let prev = -1e9;
      for (const it of list) { (it as { ty?: number }).ty = Math.max(it.st!.wy!, prev + gap); prev = (it as { ty?: number }).ty!; }
      const over = prev - (this.H - 12);
      if (over > 0) for (const it of list) (it as { ty?: number }).ty! -= over;
      const tx = side === "left" ? Math.max(8, cx - halfWidth - 22) : Math.min(this.W - 8, cx + halfWidth + 22);
      for (const it of list) {
        const y = (it as { ty?: number }).ty!;
        g.strokeStyle = it.color; g.globalAlpha = 0.75; g.lineWidth = 1;
        g.beginPath(); g.moveTo(it.ax, it.ay); g.lineTo(tx + (side === "left" ? 5 : -5), y); g.stroke();
        g.globalAlpha = 1; g.fillStyle = it.color;
        g.beginPath(); g.arc(it.ax, it.ay, 2.6, 0, 6.3); g.fill();
        g.textAlign = side === "left" ? "right" : "left";
        g.strokeStyle = "rgba(4,7,13,.9)"; g.lineWidth = 3.5;
        g.strokeText(it.text, tx, y); g.fillText(it.text, tx, y);
      }
    }
  }

  private drawLabels(g: CanvasRenderingContext2D, lens: { x: number; y: number; r: number } | null) {
    this.frameNo++;
    let hx = this.W / 2, halfW = this.W * 0.16;
    if (this.headVisible) {
      this.lp.fromArray(HEAD_C).applyMatrix4(this.headGroup.matrix);
      const c = this.toScreen(this.lp);
      this.lp.x += 10.5;
      const e = this.toScreen(this.lp);
      hx = c.x; halfW = Math.abs(e.x - c.x);
      const items = this.collectHeadLabels(lens);
      const xs = items.map((it) => it.ax).sort((a, b) => a - b);
      const med = xs.length ? xs[xs.length >> 1] : hx;
      this.headSplit += ((hx + med) / 2 - this.headSplit) * 0.2;
      this.layoutLabels(g, items, hx, halfW, "h:", this.headSplit);
    }
    if (this.S.hands) this.handRigs.forEach((rig, i) => {
      if (!rig.group.visible || !rig.pts) return;
      const P = rig.pts;
      const fx = (v: number) => this.mirror ? this.W - v : v;
      const at = (a: number, b: number, k: number) => ({
        ax: fx(P[a].x + (P[b].x - P[a].x) * k),
        ay: this.H - (P[a].y + (P[b].y - P[a].y) * k),
      });
      const items = [["Distal phalanx", 11, 12, 0.5], ["Middle phalanx", 10, 11, 0.5], ["Proximal phalanx", 9, 10, 0.5],
                     ["Metacarpal", 0, 9, 0.62], ["Carpal bones (wrist)", 0, 9, 0.1]]
        .map(([text, a, b, k]) => ({ text: text as string, color: LABEL_COLOR.hands, ...at(a as number, b as number, k as number) }))
        .filter((it) => !lens || Math.hypot(it.ax - lens.x, it.ay - lens.y) <= lens.r);
      let lo = 1e9, hi = -1e9;
      for (const p of P) { const x = fx(p.x); lo = Math.min(lo, x); hi = Math.max(hi, x); }
      const mid = (lo + hi) / 2, outerRight = mid > hx, far = outerRight ? lo - 1e4 : hi + 1e4;
      this.layoutLabels(g, items, far, outerRight ? hi - far : far - lo, "hand" + i + ":");
    });
  }

  /** Full frame: update rigs, render both scenes, draw hud extras.
   *  Returns a CSS mask-image value for the lens reveal (applied by caller). */
  renderFrame(
    shadeG: CanvasRenderingContext2D, hudG: CanvasRenderingContext2D,
    faceLms: Lm[] | null, hands: Lm[][], sides: boolean[], pointer: { x: number; y: number } | null,
  ): string | null {
    const S = this.S, W = this.W, H = this.H;
    shadeG.clearRect(0, 0, W, H);
    this.handRigs.forEach((rig, i) => {
      const lms = hands[i];
      if (lms && S.hands) {
        this.updateHand(rig, lms, sides[i]);
        this.drawHandVeil(shadeG, lms, (1 - S.real) * 0.92);
        for (const m of [rig.palm, ...rig.bones]) {
          const u = (m.material as ThreeNS.ShaderMaterial).uniforms;
          (u.uGain as { value: number }).value = S.style === "solid" ? Math.min(1.25, 0.6 + 0.4 * S.bright) : S.bright * 1.15;
          (u.uFeather as { value: number }).value = S.feather * 0.75;
        }
      } else rig.group.visible = false;
    });
    if (!this.head.found) this.headGroup.visible = false;
    this.applyLayers();

    let lens: { x: number; y: number; r: number } | null = null;
    let mask: string | null = null;
    if (S.reveal === "lens") {
      const rad = (0.07 + 0.38 * S.cut) * W;
      let cx: number, cy: number;
      if (hands[0]) { cx = hands[0][8].x * W; cy = hands[0][8].y * H; }
      else if (pointer) { cx = this.mirror ? W - pointer.x : pointer.x; cy = pointer.y; }
      else if (faceLms) { cx = faceLms[1].x * W; cy = faceLms[1].y * H; }
      else { cx = W / 2; cy = H / 2; }
      mask = `radial-gradient(circle ${rad.toFixed(1)}px at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, #000 ${(98 - 78 * S.feather).toFixed(0)}%, transparent 100%)`;
      lens = { x: this.mirror ? W - cx : cx, y: cy, r: rad };
    }

    this.renderer.clear();
    this.renderer.render(this.headScene, this.cam);
    this.renderer.clearDepth();
    this.renderer.render(this.handScene, this.ortho);

    hudG.clearRect(0, 0, W, H);
    if (lens) {
      hudG.strokeStyle = "rgba(127,209,255,.8)"; hudG.lineWidth = 2;
      hudG.beginPath(); hudG.arc(lens.x, lens.y, lens.r, 0, 6.3); hudG.stroke();
    }
    if (S.labels) this.drawLabels(hudG, lens);
    return mask;
  }

  dispose() { try { this.renderer?.dispose(); } catch { /* noop */ } }
}
