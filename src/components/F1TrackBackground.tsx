"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import type { CircuitTrack } from "@/data/circuits";

const TRACK_SCALE = 6.9;
const ORTHO_SIZE = 6.5; // vertical half-height of the isometric frustum, in world units

interface Props {
  circuitTrack?: CircuitTrack | null;
  /** Ref to the left content column — the track centers itself in whatever space is left of it. */
  contentColumnRef?: RefObject<HTMLDivElement | null>;
}

function outwardNormal(curve: THREE.CatmullRomCurve3, u: number) {
  const point = curve.getPointAt(u);
  const tangent = curve.getTangentAt(u);
  const normal = new THREE.Vector3()
    .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
    .normalize();
  // Pick whichever sign points away from the track's own centroid (roughly origin).
  const outward = point.clone().setY(0);
  if (normal.dot(outward) < 0) normal.negate();
  return normal;
}

function makeLabel(container: HTMLDivElement, cssText: string, html: string) {
  const el = document.createElement("div");
  el.style.cssText = `position:absolute;top:0;left:0;pointer-events:none;user-select:none;white-space:nowrap;will-change:transform;${cssText}`;
  el.innerHTML = html;
  container.appendChild(el);
  return el;
}

/**
 * Ambient background: the real circuit outline (extracted from OpenF1
 * location + lap-timing data — see src/data/circuits) rendered as a raised,
 * lit 3D ribbon in an isometric view, with sector ticks, approximate corner
 * pins, and a car light tracing a lap. Purely decorative — pointer-events
 * are disabled and it sits behind the landing page content.
 */
export default function F1TrackBackground({ circuitTrack, contentColumnRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const scene = new THREE.Scene();
    // Steep, near-top-down orthographic angle (45° azimuth kept for a bit of
    // depth, but a much higher elevation than classic isometric) — reads as
    // a flat track map rather than a 3D pipe.
    const camera = new THREE.OrthographicCamera(-1, 1, ORTHO_SIZE, -ORTHO_SIZE, 0.1, 100);
    camera.position.set(8, 26, 8);
    camera.lookAt(0, 0, 0);

    // The track lives at world x=0 — instead of moving the geometry, bias the
    // camera frustum so world x=0 projects to the horizontal center of
    // whatever space is left of the content column (full width on mobile,
    // where the column stacks above and takes the full row).
    const applyCameraFrustum = () => {
      const aspect = container.clientWidth / container.clientHeight;
      let frac = 0.5;
      const colEl = contentColumnRef?.current;
      if (colEl) {
        const rightStartFrac = colEl.getBoundingClientRect().right / container.clientWidth;
        if (rightStartFrac < 0.85) frac = (rightStartFrac + 1) / 2;
      }
      const span = 2 * ORTHO_SIZE * aspect;
      camera.left = -frac * span;
      camera.right = (1 - frac) * span;
      camera.top = ORTHO_SIZE;
      camera.bottom = -ORTHO_SIZE;
      camera.updateProjectionMatrix();
    };
    applyCameraFrustum();
    // Re-measure once fonts/layout settle (custom webfonts can reflow the
    // headline width slightly after first paint) and force one more render
    // so a reduced-motion (static) frame picks up the corrected framing too.
    const settleTimer = setTimeout(() => {
      applyCameraFrustum();
      renderer.render(scene, camera);
      updateLabels();
    }, 350);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0x8ea2c9, 0x0c0c10, 0.85));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.7);
    dirLight.position.set(6, 10, 7);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x8fb3ff, 0.35);
    fillLight.position.set(-8, 4, -6);
    scene.add(fillLight);

    // --- Circuit path: the real outline for the upcoming circuit when we
    // have one (extracted from OpenF1 location + lap-timing data), otherwise
    // a smooth closed loop generated from a polar radius function (r(theta)
    // is single-valued, so it never self-intersects) as a fallback.
    const trackPoints = circuitTrack?.points;
    const points3D: THREE.Vector3[] = [];
    if (trackPoints && trackPoints.length >= 3) {
      // Negate one axis: mapping a 2D "y-up" map straight onto 3D (X, Z) in a
      // Y-up scene flips the apparent rotation direction (X-toward-+Y is
      // counter-clockwise on paper, but X-toward-+Z reads clockwise on
      // screen when viewed from above) — without this, tracks render mirrored.
      for (const [x, y] of trackPoints) {
        points3D.push(new THREE.Vector3(-x * TRACK_SCALE, 0, y * TRACK_SCALE));
      }
    } else {
      const SEGMENTS = 20;
      for (let i = 0; i < SEGMENTS; i++) {
        const theta = (i / SEGMENTS) * Math.PI * 2;
        const r =
          1.9 +
          0.45 * Math.sin(theta * 2 + 0.6) +
          0.2 * Math.sin(theta * 3 - 1.1) +
          0.12 * Math.sin(theta * 5 + 2.0);
        points3D.push(
          new THREE.Vector3(Math.cos(theta) * r, 0, Math.sin(theta) * r * 0.6)
        );
      }
    }
    const curve = new THREE.CatmullRomCurve3(points3D, true, "centripetal");

    const trackGroup = new THREE.Group();
    scene.add(trackGroup);

    // --- Ribbon: a wide tube with real rounded cross-section (enough
    // curvature to show a visible lit/shadow gradient from the two
    // directional lights), plus a soft, closely-hugging red rim glow as the
    // only red accent — no separate center stripe, so it can't read as a
    // second parallel track.
    const RIBBON_SEGMENTS = 260;
    const ribbonMat = new THREE.MeshStandardMaterial({
      color: 0xc7cad2,
      metalness: 0.15,
      roughness: 0.6,
    });
    const ribbonGeo = new THREE.TubeGeometry(curve, RIBBON_SEGMENTS, 0.15, 16, true);
    const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    ribbonMesh.scale.y = 0.22;
    trackGroup.add(ribbonMesh);

    const glowGeo = new THREE.TubeGeometry(curve, RIBBON_SEGMENTS, 0.165, 10, true);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xe10600,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    glowMesh.scale.y = 0.22;
    trackGroup.add(glowMesh);

    // --- Cars: bright points + fading trails riding the curve, spread out
    // like a race pack rather than a single lonely dot.
    const TRAIL_LENGTH = 46;
    const CAR_COUNT = 5;
    interface CarState {
      mesh: THREE.Mesh;
      carGeo: THREE.SphereGeometry;
      carMat: THREE.MeshBasicMaterial;
      trailGeo: THREE.BufferGeometry;
      trailMat: THREE.LineBasicMaterial;
      trailPositions: Float32Array;
      trailPoints: THREE.Vector3[] | null;
      phase: number;
    }
    const cars: CarState[] = [];
    for (let i = 0; i < CAR_COUNT; i++) {
      const isLead = i === 0;
      const carGeo = new THREE.SphereGeometry(isLead ? 0.075 : 0.058, 12, 12);
      const carMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: !isLead,
        opacity: isLead ? 1 : 0.8,
      });
      const mesh = new THREE.Mesh(carGeo, carMat);
      mesh.position.y = 0.1;
      trackGroup.add(mesh);
      if (isLead) {
        const carLight = new THREE.PointLight(0xff3b30, 2.2, 1.6);
        mesh.add(carLight);
      }

      const trailPositions = new Float32Array(TRAIL_LENGTH * 3);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
      const trailMat = new THREE.LineBasicMaterial({
        color: 0xff3b30,
        transparent: true,
        opacity: isLead ? 0.55 : 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const trailLine = new THREE.Line(trailGeo, trailMat);
      trackGroup.add(trailLine);

      cars.push({
        mesh,
        carGeo,
        carMat,
        trailGeo,
        trailMat,
        trailPositions,
        trailPoints: null,
        phase: i / CAR_COUNT,
      });
    }

    // --- Depth particles ---
    const PARTICLE_COUNT = 200;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particlePos[i * 3] = (Math.random() - 0.5) * 24;
      particlePos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      particlePos[i * 3 + 2] = (Math.random() - 0.5) * 18 - 4;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.03,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // --- HTML overlay: sector ticks/labels + approximate corner pins ---
    // (projected from 3D each frame — cheap for this few elements)
    const labelDefs: { el: HTMLDivElement; worldPos: THREE.Vector3 }[] = [];
    const worldFromLocal = (v: THREE.Vector3) => trackGroup.localToWorld(v.clone());

    if (circuitTrack?.sectorU) {
      const { sector1End, sector2End } = circuitTrack.sectorU;
      const bounds = [sector1End, sector2End];
      for (const u of bounds) {
        const p = curve.getPointAt(u);
        const n = outwardNormal(curve, u);
        const tickPos = p.clone().addScaledVector(n, 0.22);
        labelDefs.push({
          el: makeLabel(
            container,
            "font:600 9px/1 'Formula1 Display',sans-serif;color:rgba(255,255,255,0.55);letter-spacing:.15em;",
            "•"
          ),
          worldPos: worldFromLocal(tickPos),
        });
      }
      const sectorMids = [
        sector1End / 2,
        (sector1End + sector2End) / 2,
        (sector2End + 1) / 2,
      ];
      sectorMids.forEach((u, i) => {
        const p = curve.getPointAt(u % 1);
        const n = outwardNormal(curve, u % 1);
        const labelPos = p.clone().addScaledVector(n, 0.55);
        labelDefs.push({
          el: makeLabel(
            container,
            "font:700 10px/1 'Formula1 Display',sans-serif;color:rgba(255,110,100,0.98);letter-spacing:.2em;" +
              "background:rgba(8,8,12,0.72);border:1px solid rgba(225,6,0,0.5);border-radius:3px;padding:3px 7px;",
            `SECTOR ${i + 1}`
          ),
          worldPos: worldFromLocal(labelPos),
        });
      });
    }

    for (const corner of circuitTrack?.corners ?? []) {
      const p = curve.getPointAt(corner.u);
      const n = outwardNormal(curve, corner.u);
      const labelPos = p.clone().addScaledVector(n, 0.32);
      labelDefs.push({
        el: makeLabel(
          container,
          "display:flex;align-items:center;justify-content:center;width:19px;height:19px;border-radius:9999px;" +
            "background:rgba(10,10,14,0.6);border:1px solid rgba(255,255,255,0.3);" +
            "font:600 10px/1 'Formula1 Display',sans-serif;color:rgba(255,255,255,0.75);",
          String(corner.number)
        ),
        worldPos: worldFromLocal(labelPos),
      });
    }

    if (circuitTrack) {
      const startPos = curve.getPointAt(0).addScaledVector(outwardNormal(curve, 0), 0.4);
      labelDefs.push({
        el: makeLabel(
          container,
          "font-size:13px;filter:drop-shadow(0 0 3px rgba(0,0,0,0.6));",
          "🏁"
        ),
        worldPos: worldFromLocal(startPos),
      });
    }

    const updateLabels = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      for (const { el, worldPos } of labelDefs) {
        const ndc = worldPos.clone().project(camera);
        if (ndc.z < -1 || ndc.z > 1) {
          el.style.visibility = "hidden";
          continue;
        }
        el.style.visibility = "visible";
        const x = (ndc.x * 0.5 + 0.5) * w;
        const y = (-ndc.y * 0.5 + 0.5) * h;
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      }
    };

    // --- Mouse parallax ---
    const mouse = { x: 0, y: 0 };
    const targetMouse = { x: 0, y: 0 };
    const onPointerMove = (e: PointerEvent) => {
      targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      targetMouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onPointerMove);

    const onResize = () => {
      if (!container) return;
      applyCameraFrustum();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    const baseCamPos = camera.position.clone();
    const startTime = performance.now();
    const LAP_DURATION = 14; // seconds per lap

    const renderStaticFrame = () => {
      for (const c of cars) {
        const p = curve.getPointAt(c.phase);
        c.mesh.position.x = p.x;
        c.mesh.position.z = p.z;
        for (let i = 0; i < TRAIL_LENGTH; i++) {
          c.trailPositions[i * 3] = p.x;
          c.trailPositions[i * 3 + 1] = p.y + 0.08;
          c.trailPositions[i * 3 + 2] = p.z;
        }
        c.trailGeo.attributes.position.needsUpdate = true;
      }
      renderer.render(scene, camera);
      updateLabels();
    };

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const elapsed = (performance.now() - startTime) / 1000;

      for (const c of cars) {
        const t = ((elapsed / LAP_DURATION) + c.phase) % 1;
        const point = curve.getPointAt(t);
        c.mesh.position.x = point.x;
        c.mesh.position.z = point.z;

        // A throttled/backgrounded tab can skip straight from one rAF
        // callback to the next many seconds later — the car legitimately
        // teleports ahead, but the trail must not draw one long segment
        // across the gap. Detect an implausible per-frame jump and restart
        // the trail fresh at the new position instead.
        const lastHead = c.trailPoints?.[0];
        if (!c.trailPoints || (lastHead && lastHead.distanceTo(point) > 0.8)) {
          c.trailPoints = Array.from({ length: TRAIL_LENGTH }, () => point.clone());
        }
        c.trailPoints.pop();
        c.trailPoints.unshift(point.clone());
        for (let i = 0; i < TRAIL_LENGTH; i++) {
          const tp = c.trailPoints[i];
          c.trailPositions[i * 3] = tp.x;
          c.trailPositions[i * 3 + 1] = tp.y + 0.08;
          c.trailPositions[i * 3 + 2] = tp.z;
        }
        c.trailGeo.attributes.position.needsUpdate = true;
      }

      particles.rotation.y = elapsed * 0.008;

      mouse.x += (targetMouse.x - mouse.x) * 0.04;
      mouse.y += (targetMouse.y - mouse.y) * 0.04;
      camera.position.x = baseCamPos.x + mouse.x * 1.2;
      camera.position.y = baseCamPos.y - mouse.y * 0.8;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      updateLabels();
    };

    if (prefersReducedMotion) {
      renderStaticFrame();
    } else {
      animate();
    }

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settleTimer);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("resize", onResize);
      for (const { el } of labelDefs) el.remove();
      ribbonGeo.dispose();
      ribbonMat.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      for (const c of cars) {
        c.carGeo.dispose();
        c.carMat.dispose();
        c.trailGeo.dispose();
        c.trailMat.dispose();
      }
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [circuitTrack]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    />
  );
}
