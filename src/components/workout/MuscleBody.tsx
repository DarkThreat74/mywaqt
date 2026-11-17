"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { atlasBucket, fatigueColor, type BodyBucket } from "@/lib/workout/muscleBodyMap";

type AtlasMuscle = { id: string; key: string; label: string; group: string; region: string };

interface Props {
  sex?: "male" | "female";
  /** bucket → unrecovered fraction 0..1 */
  fatigue: Partial<Record<BodyBucket, number>>;
  /** bucket currently selected — rendered in highlight color */
  selectedBucket?: BodyBucket | null;
  onSelect?: (bucket: BodyBucket, label: string) => void;
  /** called when WebGL/model is unavailable — parent should show 2D fallback */
  onFallback?: () => void;
  className?: string;
}

/**
 * Rotatable 3D muscle body (fitmitwith atlas GLB, ~2.5MB, self-hosted).
 * Vanilla three.js — no R3F. Demand-rendered: only draws on interaction.
 * Drag = rotate, wheel/pinch = zoom, tap = select muscle.
 */
export default function MuscleBody({ sex = "male", fatigue, selectedBucket, onSelect, onFallback, className }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef({ fatigue, selectedBucket, onSelect, onFallback });
  const recolorRef = useRef<() => void>(() => {});

  // cbRef tracks latest props every render (cheap). recolor is expensive —
  // ~200 material needsUpdate shader rebuilds — so it only runs when the
  // inputs it actually reads change, not on every parent render.
  useEffect(() => {
    cbRef.current = { fatigue, selectedBucket, onSelect, onFallback };
  }, [fatigue, selectedBucket, onSelect, onFallback]);
  useEffect(() => {
    recolorRef.current();
  }, [fatigue, selectedBucket]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    // Perf tier: low-end devices (≤4 cores or ≤4GB) get no AA + DPR 1.
    const nav = navigator as Navigator & { deviceMemory?: number };
    const lowEnd = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !lowEnd, alpha: true, powerPreference: "high-performance" });
    } catch {
      mount.dataset.state = "error";
      cbRef.current.onFallback?.();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowEnd ? 1 : 1.5));
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6b5d4a, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(2, 3, 4);
    scene.add(dir);
    const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 50);

    let raf = 0, dirty = true, disposed = false;
    const render = () => {
      if (disposed || !dirty) return;
      dirty = false;
      raf = requestAnimationFrame(() => renderer.render(scene, cam));
    };
    const invalidate = () => { dirty = true; render(); };

    // ---- orbit state ----
    const orbit = { yaw: 0, pitch: 0.08, dist: 3.4, tx: 0, ty: 0 };
    let dragging = false, downX = 0, downY = 0;
    let originX = 0, originY = 0, movedTotal = 0;
    let lastTap = 0, lastTapX = 0, lastTapY = 0;
    // tapFired marks "this gesture already produced a tap" so the trailing
    // click event can't double-fire — replaces the old 250ms lastPick window
    // that swallowed legitimate fast successive taps.
    let tapFired = false;
    // Single-tap select is delayed ~300ms so a fast second tap can cancel it
    // and trigger the double-tap camera reset — the detail sheet covers the
    // canvas, so without the delay the reset could never be reached.
    let pendingPickTimer = 0;
    const TAP_DELAY = 300;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchD = 0;

    const applyCam = () => {
      cam.position.set(
        Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist,
        orbit.ty + Math.sin(orbit.pitch) * orbit.dist,
        Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist,
      );
      cam.lookAt(orbit.tx, orbit.ty, 0);
      invalidate();
    };

    const onDown = (e: PointerEvent) => {
      if (pointers.size === 0) { originX = e.clientX; originY = e.clientY; movedTotal = 0; tapFired = false; }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      }
      dragging = true; downX = e.clientX; downY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD > 0) { orbit.dist = THREE.MathUtils.clamp(orbit.dist * (pinchD / d), 1.6, 6); applyCam(); }
        pinchD = d; return;
      }
      if (!dragging) return;
      movedTotal = Math.max(movedTotal, Math.hypot(e.clientX - originX, e.clientY - originY));
      // Deadzone: sub-10px jitter shouldn't rotate the model — it's almost
      // always a tap whose finger rolled slightly.
      if (movedTotal < 10) return;
      const dx = e.clientX - downX, dy = e.clientY - downY;
      downX = e.clientX; downY = e.clientY;
      orbit.yaw -= dx * 0.008;
      orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * 0.006, -0.5, 1.1);
      applyCam();
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId); pinchD = 0;
      if (pointers.size === 0) {
        dragging = false;
        // pointercancel counts too — the browser pre-empting the gesture
        // used to kill taps silently.
        if (movedTotal < 26) { handleTap(e.clientX, e.clientY); tapFired = true; }
      }
    };
    // Fallback for browsers/devices where pointerup is pre-empted — a real
    // click only fires when the gesture didn't turn into a drag anyway.
    const onClick = (e: MouseEvent) => {
      if (!tapFired && movedTotal < 26) handleTap(e.clientX, e.clientY);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbit.dist = THREE.MathUtils.clamp(orbit.dist * (1 + e.deltaY * 0.001), 1.6, 6);
      applyCam();
    };
    const el = renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick);
    el.addEventListener("wheel", onWheel, { passive: false });

    // ---- model ----
    // Every mesh gets tracked — bucket may be null (bones/organs/support).
    // Unmapped meshes get a neutral tone so atlas palette never shows through.
    // localCenter feeds the nearest-muscle tap fallback.
    const meshBucket = new Map<THREE.Object3D, {
      bucket: BodyBucket | null; label: string;
      mats: THREE.MeshStandardMaterial[]; localCenter: THREE.Vector3;
    }>();
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const recolor = () => {
      const f = cbRef.current.fatigue;
      const sel = cbRef.current.selectedBucket;
      for (const [, info] of meshBucket) {
        const v = info.bucket ? (f[info.bucket] ?? 0) : -1;
        const col = new THREE.Color(
          info.bucket && info.bucket === sel ? "#d9a441" // selection highlight — warm gold
          : v < 0 ? "#d8cdb8"
          : fatigueColor(v),
        );
        for (const mat of info.mats) {
          mat.color.copy(col);
          mat.map = null;
          mat.vertexColors = false;
          const isSel = info.bucket != null && info.bucket === sel;
          if ("emissive" in mat) {
            (mat as THREE.MeshStandardMaterial).emissive.set(isSel ? "#d9a441" : "#000000");
            (mat as THREE.MeshStandardMaterial).emissiveIntensity = isSel ? 0.5 : 0;
          }
          mat.needsUpdate = true;
        }
      }
      invalidate();
    };

    const pick = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hits = ray.intersectObjects(scene.children, true);
      // First bucketed hit per bucket, with distance — the oblique shells in
      // this atlas protrude ~1cm past rectus abdominis, so a front-core tap
      // always hits "obliques" first even though the rectus is the muscle
      // being touched. When both are hit within shell distance, abs wins.
      const byBucket = new Map<BodyBucket, { d: number; label: string }>();
      for (const h of hits) {
        let o: THREE.Object3D | null = h.object;
        while (o) {
          const info = meshBucket.get(o);
          if (info?.bucket) {
            const cur = byBucket.get(info.bucket);
            if (!cur || h.distance < cur.d) byBucket.set(info.bucket, { d: h.distance, label: info.label });
            break;
          }
          o = o.parent;
        }
      }
      if (byBucket.size) {
        let win = [...byBucket.entries()].sort((a, b) => a[1].d - b[1].d)[0];
        const absHit = byBucket.get("abs");
        if (win[0] === "obliques" && absHit && absHit.d - win[1].d < 0.15) win = ["abs", absHit];
        cbRef.current.onSelect?.(win[0], win[1].label);
        return;
      }
      // Raycast missed (small muscle, edge-on view) — fall back to the mapped
      // muscle whose center projects closest to the tap on screen.
      const v = new THREE.Vector3();
      let best: { d: number; bucket: BodyBucket; label: string } | null = null;
      for (const [obj, info] of meshBucket) {
        if (!info.bucket) continue;
        v.copy(info.localCenter).applyMatrix4(obj.matrixWorld).project(cam);
        if (v.z > 1) continue; // behind camera
        const d = Math.hypot(v.x - ndc.x, v.y - ndc.y);
        if (d < 0.18 && (!best || d < best.d)) best = { d, bucket: info.bucket, label: info.label };
      }
      if (best) cbRef.current.onSelect?.(best.bucket, best.label);
      else console.debug("[MuscleBody] tap hit nothing", hits.length, "raycast hits");
    };

    const handleTap = (cx: number, cy: number) => {
      const now = performance.now();
      const isDouble = now - lastTap < TAP_DELAY && Math.hypot(cx - lastTapX, cy - lastTapY) < 40;
      lastTap = now; lastTapX = cx; lastTapY = cy;
      if (pendingPickTimer) { clearTimeout(pendingPickTimer); pendingPickTimer = 0; }
      if (isDouble) { // double-tap resets the camera
        orbit.yaw = 0; orbit.pitch = 0.08; orbit.dist = 3.4; applyCam();
        return;
      }
      pendingPickTimer = window.setTimeout(() => { pendingPickTimer = 0; pick(cx, cy); }, TAP_DELAY);
    };

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      invalidate();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // GLB node names look like "deltoid_anterior_left__mobile.002" —
    // normalize to the map id "deltoid_anterior_left".
    const norm = (n: string) => n.replace(/__mobile.*$/, "").replace(/\.\d+$/, "");
    let modelRoot: THREE.Object3D | null = null;
    Promise.all([
      new GLTFLoader().loadAsync(`/models/anatomy/full-body-${sex}-mobile.glb`),
      fetch(`/models/anatomy/${sex === "female" ? "female-muscle-map" : "full-body-map"}.json`).then((r) => r.json()).catch(() => null),
    ]).then(([gltf, mapJson]) => {
      if (disposed) return;
      modelRoot = gltf.scene;
      const muscles: AtlasMuscle[] = Array.isArray(mapJson?.muscles) ? mapJson.muscles : [];
      const byId = new Map(muscles.flatMap((m) => [[m.id, m], [norm(m.id), m]] as const));
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // GLB exporters often leave mesh nodes unnamed and put the muscle
        // name on a parent group — collect candidate names up the chain.
        const candidates: string[] = [];
        let n: THREE.Object3D | null = mesh;
        while (n && candidates.length < 4) {
          if (n.name) candidates.push(norm(n.name));
          n = n.parent;
        }
        let am: AtlasMuscle | undefined;
        for (const name of candidates) {
          am = byId.get(name) ?? muscles.find((m) => m.key === name.replace(/_(left|right)$/, ""));
          if (am) break;
        }
        // Materials may be shared or arrays — clone per mesh so recoloring
        // one muscle never bleeds into another.
        const srcMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const mats = srcMats.map((m) =>
          (m as THREE.MeshStandardMaterial).clone() as THREE.MeshStandardMaterial,
        );
        mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
        const bucket = am ? atlasBucket(`${am.label} ${am.key}`, am.group || am.region || "") : null;
        const geo = mesh.geometry as THREE.BufferGeometry | undefined;
        geo?.computeBoundingSphere?.();
        const localCenter = geo?.boundingSphere ? geo.boundingSphere.center.clone() : new THREE.Vector3();
        meshBucket.set(mesh, { bucket, label: am?.label ?? "", mats, localCenter });
      });
      scene.add(gltf.scene);
      // Center + scale: atlas is ~1.8m tall in meters; frame it.
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      const scale = 2.4 / Math.max(size.y, 0.001);
      gltf.scene.scale.setScalar(scale);
      const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
      gltf.scene.position.sub(center);
      orbit.ty = 0; orbit.dist = 3.4;
      applyCam();
      resize();
      recolor();
    }).catch((err) => {
      console.error("[MuscleBody] failed to load anatomy model", err);
      mount.dataset.state = "error";
      cbRef.current.onFallback?.();
    });

    recolorRef.current = recolor;

    return () => {
      disposed = true;
      if (pendingPickTimer) clearTimeout(pendingPickTimer);
      cancelAnimationFrame(raf);
      ro.disconnect();
      // Free GPU resources — geometries, cloned materials, and textures would
      // otherwise leak on every visit to the muscles page.
      modelRoot?.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          const sm = mat as THREE.MeshStandardMaterial;
          sm.map?.dispose(); sm.normalMap?.dispose(); sm.roughnessMap?.dispose(); sm.metalnessMap?.dispose();
          sm.dispose();
        }
      });
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick);
      el.removeEventListener("wheel", onWheel);
      renderer.dispose();
      mount.removeChild(el);
    };
  }, [sex]);

  return <div ref={mountRef} className={className} style={{ width: "100%", height: "100%", touchAction: "none" }} />;
}
