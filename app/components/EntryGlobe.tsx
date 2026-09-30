"use client";

import createGlobe, { type Arc, type Marker } from "cobe";
import { useEffect, useRef, useState } from "react";

// Decorative only — the entry page runs before the user joins, so these are
// illustrative cities, not live presence.
const MARKERS: Marker[] = [
  { location: [6.5244, 3.3792], size: 0.06 }, // Lagos
  { location: [51.5072, -0.1276], size: 0.05 }, // London
  { location: [40.7128, -74.006], size: 0.06 }, // New York
  { location: [-23.5505, -46.6333], size: 0.05 }, // São Paulo
  { location: [35.6762, 139.6503], size: 0.06 }, // Tokyo
  { location: [19.076, 72.8777], size: 0.05 }, // Mumbai
  { location: [-33.8688, 151.2093], size: 0.04 }, // Sydney
  { location: [-1.2921, 36.8219], size: 0.04 }, // Nairobi
  { location: [52.52, 13.405], size: 0.04 }, // Berlin
  { location: [34.0522, -118.2437], size: 0.05 }, // Los Angeles
];

const ARCS: Arc[] = [
  { from: [6.5244, 3.3792], to: [51.5072, -0.1276] },
  { from: [40.7128, -74.006], to: [-23.5505, -46.6333] },
  { from: [19.076, 72.8777], to: [35.6762, 139.6503] },
  { from: [-1.2921, 36.8219], to: [52.52, 13.405] },
];

const AUTO_SPIN = 0.0025; // radians per frame at 60fps
const DRAG_SENSITIVITY = 0.005; // radians per pixel
const FRICTION = 0.94; // inertia decay per frame after release
const MAX_TILT = 0.7;
const REST_TILT = 0.25;

export default function EntryGlobe() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let size = wrap.offsetWidth;
    // Start with Africa/Europe facing the viewer.
    let phi = -0.3;
    let theta = REST_TILT;
    let velocityPhi = 0;
    let velocityTheta = 0;
    let pointer: { id: number; x: number; y: number } | null = null;
    let frame = 0;
    let last = performance.now();

    let globe: ReturnType<typeof createGlobe>;
    try {
      globe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width: size * dpr,
        height: size * dpr,
        phi,
        theta,
        dark: 1,
        diffuse: 1.4,
        mapSamples: 20000,
        mapBrightness: 5,
        mapBaseBrightness: 0.02,
        baseColor: [0.18, 0.32, 0.4],
        markerColor: [0.13, 0.83, 0.93],
        glowColor: [0.07, 0.24, 0.3],
        markers: MARKERS,
        arcs: ARCS,
        arcColor: [0.4, 0.9, 1],
        arcWidth: 0.6,
        arcHeight: 0.25,
        markerElevation: 0.01,
      });
    } catch {
      // No WebGL — the static backdrop stays in place.
      setFailed(true);
      return;
    }

    const onPointerDown = (e: PointerEvent) => {
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      velocityPhi = 0;
      velocityTheta = 0;
      canvas.setPointerCapture(e.pointerId);
      setDragging(true);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointer || e.pointerId !== pointer.id) return;
      const dx = e.clientX - pointer.x;
      const dy = e.clientY - pointer.y;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      velocityPhi = dx * DRAG_SENSITIVITY;
      velocityTheta = dy * DRAG_SENSITIVITY;
      phi += velocityPhi;
      theta = clamp(theta + velocityTheta, -MAX_TILT, MAX_TILT);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointer || e.pointerId !== pointer.id) return;
      pointer = null;
      setDragging(false);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    const resize = new ResizeObserver(() => {
      size = wrap.offsetWidth;
    });
    resize.observe(wrap);

    const tick = (now: number) => {
      // Normalise to 60fps so spin speed is the same on 120Hz displays.
      const step = Math.min((now - last) / (1000 / 60), 4);
      last = now;

      if (!pointer) {
        // Coast on release, then settle back into the idle spin and tilt.
        velocityPhi *= FRICTION ** step;
        velocityTheta *= FRICTION ** step;
        phi += velocityPhi * step + (reduceMotion ? 0 : AUTO_SPIN * step);
        theta = clamp(theta + velocityTheta * step, -MAX_TILT, MAX_TILT);
        if (Math.abs(velocityTheta) < 0.001) {
          theta += (REST_TILT - theta) * 0.03 * step;
        }
      }

      globe.update({ phi, theta, width: size * dpr, height: size * dpr });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // Let the first frames render before fading in, so there's no flash.
    const fadeIn = window.setTimeout(() => setReady(true), 120);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fadeIn);
      resize.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      globe.destroy();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="relative mx-auto aspect-square w-full max-w-[620px]"
    >
      <div className="entry-globe-glow pointer-events-none absolute inset-[6%] rounded-full" />

      <svg
        viewBox="0 0 600 600"
        className="entry-orbit pointer-events-none absolute inset-0 h-full w-full text-cyan-300"
        fill="none"
      >
        <circle
          cx="300"
          cy="300"
          r="290"
          stroke="currentColor"
          strokeOpacity=".15"
          strokeDasharray="2 10"
        />
        <path
          d="M300 10a290 290 0 0 1 290 290"
          stroke="currentColor"
          strokeOpacity=".6"
        />
      </svg>

      <div ref={wrapRef} className="absolute inset-[4%]">
        {!failed && (
          <canvas
            ref={canvasRef}
            className={`h-full w-full touch-pan-y transition-opacity duration-1000 motion-reduce:transition-none ${
              ready ? "opacity-100" : "opacity-0"
            } ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          />
        )}
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
