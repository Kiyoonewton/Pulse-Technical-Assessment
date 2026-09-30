"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { PeerDot } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "pk.eyJ1IjoicHVsc2UtbWFwIiwiYSI6ImNrMDBkZW1vMDAwMDAwMDAifQ.AAAAAAAAAAAAAAAAAAAAAA";

// function dotColor(id: string): string {
//   let hash = 0;
//   for (let i = 0; i < id.length; i++) {
//     hash = (hash * 31 + id.charCodeAt(i)) | 0;
//   }
//   return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
// }

export default function WorldMap({
  peers,
  me,
  onPeerClick,
  canConnect,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  // Marker click handlers are bound once, so read the live click handler +
  // connectability through refs (synced in an effect, never during render).
  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
  });

  // Initialise the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        // Open centered on the user if we know where they are, else world view.
        center: me ? [me.lng, me.lat] : [0, 20],
        zoom: 1.5,
        projection: "globe",
        attributionControl: true,
      });
      map.on("load", () => {
        if (cancelled) return;

        map.setFog({
          color: "#102332",
          "high-color": "#123b4a",
          "space-color": "#0a0d14",
          "horizon-blend": 0.12,
          "star-intensity": 0,
        });

        // Keep country names for orientation; remove smaller labels.
        for (const layer of map.getStyle().layers ?? []) {
          if (layer.type === "symbol" && layer.id !== "country-label") {
            map.setLayoutProperty(layer.id, "visibility", "none");
          }
        }

        if (map.getLayer("water")) {
          map.setPaintProperty("water", "fill-color", "#091521");
        }

        if (map.getLayer("land")) {
          map.setPaintProperty("land", "background-color", "#111f2b");
        }

        setReady(true);
      });
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // `me` is only read for the initial center; we don't want to re-init on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show / move the user's own "you are here" pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me";
        el.title = "You are here";
        el.innerHTML = `<span class="pulse-me-label">Me</span>📍`;
        // anchor "bottom" → the pin's tip sits on the exact coordinate.
        meMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, ready]);

  // Reconcile markers whenever the peer list changes (or the map becomes ready).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();

      for (const peer of peers) {
        seen.add(peer.id);
        let marker = markers.get(peer.id);
        if (!marker) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "pulse-dot";
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (canConnectRef.current) onPeerClickRef.current(peer.id);
          });
          marker = new mapboxgl.Marker({ element: el })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        }
        marker.setLngLat([peer.lng, peer.lat]);

        const element = marker.getElement();
        const label = `Stranger ${peer.id.slice(0, 4).toUpperCase()}`;
        const availability = peer.busy ? "In a conversation" : "Available";

        element.dataset.busy = String(peer.busy);
        element.title = `${label} · ${availability}`;
        element.setAttribute(
          "aria-label",
          `${label}, ${availability.toLowerCase()}. View participant.`,
        );
      }

      // Drop markers for peers that went offline / got filtered out.
      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-zinc-900" />

      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-md rounded-lg bg-zinc-800 p-4 text-sm text-zinc-200">
            Set{" "}
            <code className="text-emerald-400">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code>.env</code> to load the map.
          </p>
        </div>
      )}

      {/* Online count */}
      <div className="pointer-events-none absolute inset-x-4 top-5 flex items-start justify-between gap-4 sm:inset-x-6">
        <div>
          <p className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full bg-cyan-300"
            />
            Pulse
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Select a dot. Start with hello.
          </p>
        </div>

        <div className="rounded-xl border border-cyan-300/15 bg-[#111622]/95 px-4 py-3 text-right">
          <p className="text-sm font-medium text-slate-100">
            {peers.length} {peers.length === 1 ? "other person" : "other people"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {peers.filter((peer) => !peer.busy).length} available
          </p>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-10 left-4 flex gap-4 rounded-xl border border-white/10 bg-[#111622]/95 px-4 py-3 text-xs text-slate-300 sm:left-6">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-cyan-300"
          />
          Available
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 rounded-sm bg-amber-400"
          />
          In conversation
        </span>
      </div>
    </div>
  );
}
