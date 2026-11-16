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
export default function MuscleBody({ sex = "male", fatigue, onSelect, onFallback, className }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef({ fatigue, onSelect, onFallback });
  const recolorRef = useRef<() => void>(() => {});

  useEffect(() => {
    cbRef.current = { fatigue, onSelect, onFallback };
    recolorRef.current();
  }, [fatigue, onSelect, onFallback]);

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
    let dragging = false, downX = 0, downY = 0, moved = 0;
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
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      }
      dragging = true; moved = 0; downX = e.clientX; downY = e.clientY;
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
      const dx = e.clientX - downX, dy = e.clientY - downY;
      moved = Math.max(moved, Math.hypot(dx, dy));
      downX = e.clientX; downY = e.clientY;
      orbit.yaw -= dx * 0.008;
      orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * 0.006, -0.5, 1.1);
      applyCam();
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId); pinchD = 0;
      if (pointers.size === 0) dragging = false;
      if (moved < 6 && e.type === "pointerup") pick(e.clientX, e.clientY);
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
    el.addEventListener("wheel", onWheel, { passive: false });

    // ---- model ----
    // Every mesh gets tracked — bucket may be null (bones/organs/support).
    // Unmapped meshes get a neutral tone so atlas palette never shows through.
    const meshBucket = new Map<THREE.Object3D, { bucket: BodyBucket | null; label: string; mats: THREE.MeshStandardMaterial[] }>();
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const recolor = () => {
      const f = cbRef.current.fatigue;
      for (const [, info] of meshBucket) {
        const v = info.bucket ? (f[info.bucket] ?? 0) : -1;
        const col = new THREE.Color(v < 0 ? "#d8cdb8" : fatigueColor(v));
        for (const mat of info.mats) {
          mat.color.copy(col);
          mat.map = null;
          mat.vertexColors = false;
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
      for (const h of hits) {
        // Hit may be a child of the named node — walk ancestors.
        let o: THREE.Object3D | null = h.object;
        while (o) {
          const info = meshBucket.get(o);
          if (info?.bucket) { cbRef.current.onSelect?.(info.bucket, info.label); return; }
          o = o.parent;
        }
      }
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
    Promise.all([
      new GLTFLoader().loadAsync(`/models/anatomy/full-body-${sex}-mobile.glb`),
      fetch(`/models/anatomy/${sex === "female" ? "female-muscle-map" : "full-body-map"}.json`).then((r) => r.json()).catch(() => null),
    ]).then(([gltf, mapJson]) => {
      if (disposed) return;
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
        meshBucket.set(mesh, { bucket, label: am?.label ?? "", mats });
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
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      renderer.dispose();
      mount.removeChild(el);
    };
  }, [sex]);

  return <div ref={mountRef} className={className} style={{ width: "100%", height: "100%", touchAction: "none" }} />;
}
