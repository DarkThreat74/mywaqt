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
  className?: string;
}

/**
 * Rotatable 3D muscle body (fitmitwith atlas GLB, ~2.5MB, self-hosted).
 * Vanilla three.js — no R3F. Demand-rendered: only draws on interaction.
 * Drag = rotate, wheel/pinch = zoom, tap = select muscle.
 */
export default function MuscleBody({ sex = "male", fatigue, onSelect, className }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef({ fatigue, onSelect });
  const recolorRef = useRef<() => void>(() => {});

  useEffect(() => {
    cbRef.current = { fatigue, onSelect };
    recolorRef.current();
  }, [fatigue, onSelect]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // WebGL unavailable — parent shows fallback
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    const meshBucket = new Map<THREE.Object3D, { bucket: BodyBucket; label: string }>();
    const baseColors = new Map<THREE.Material, THREE.Color>();
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const recolor = () => {
      const f = cbRef.current.fatigue;
      for (const [mesh, info] of meshBucket) {
        const mat = (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (!mat?.color) continue;
        const v = f[info.bucket];
        if (v == null) continue;
        mat.color.set(fatigueColor(v));
        mat.needsUpdate = true;
      }
      invalidate();
    };

    const pick = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hits = ray.intersectObjects(scene.children, true);
      for (const h of hits) {
        const info = meshBucket.get(h.object);
        if (info) { cbRef.current.onSelect?.(info.bucket, info.label); return; }
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

    Promise.all([
      new GLTFLoader().loadAsync(`/models/anatomy/full-body-${sex}-mobile.glb`),
      fetch(`/models/anatomy/${sex === "female" ? "female-muscle-map" : "full-body-map"}.json`).then((r) => r.json()).catch(() => null),
    ]).then(([gltf, mapJson]) => {
      if (disposed) return;
      const muscles: AtlasMuscle[] = Array.isArray(mapJson?.muscles) ? mapJson.muscles : [];
      const byId = new Map(muscles.map((m) => [m.id, m]));
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const srcMat = (mesh.material as THREE.MeshStandardMaterial) ?? new THREE.MeshStandardMaterial();
        const mat = (srcMat as THREE.MeshStandardMaterial).clone();
        if (!baseColors.has(mat)) baseColors.set(mat, mat.color.clone());
        mesh.material = mat;
        const am = byId.get(mesh.name) ?? muscles.find((m) => m.key === mesh.name);
        const bucket = am ? atlasBucket(`${am.label} ${am.key}`, am.group || am.region || "") : null;
        if (bucket) meshBucket.set(mesh, { bucket, label: am!.label });
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
    }).catch(() => { /* model failed — leave blank, parent fallback */ });

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
