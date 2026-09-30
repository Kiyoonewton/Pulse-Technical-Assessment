"use client";

import { useRef, useState } from "react";
import EntryGlobe from "./EntryGlobe";

type EntryStatus = "idle" | "locating" | "joining" | "error";

export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number) => void | Promise<void>;
}) {
  const [status, setStatus] = useState<EntryStatus>("idle");
  const [error, setError] = useState("");
  const entering = useRef(false);

  const busy = status === "locating" || status === "joining";

  function fail(message: string) {
    entering.current = false;
    setError(message);
    setStatus("error");
  }

  function enter() {
    if (entering.current) return;

    if (!("geolocation" in navigator)) {
      fail("This browser cannot access your location. Try another browser.");
      return;
    }

    entering.current = true;
    setError("");
    setStatus("locating");

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setStatus("joining");

        try {
          await onReady(coords.latitude, coords.longitude);
          entering.current = false;
        } catch {
          fail(
            "We found your location, but couldn't join Pulse. Please try again shortly.",
          );
        }
      },
      (locationError) => {
        switch (locationError.code) {
          case 1:
            fail(
              "Location access is blocked. Allow location in your browser's site settings, then try again.",
            );
            break;
          case 3:
            fail(
              "Finding your location took too long. Check that location services are enabled, then try again.",
            );
            break;
          default:
            fail(
              "Your location is unavailable. Check your device's location services and try again.",
            );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      },
    );
  }

  const buttonLabel =
    status === "locating"
      ? "Finding your location…"
      : status === "joining"
        ? "Joining the globe…"
        : status === "error"
          ? "Try again"
          : "Enter Pulse";

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_40%,#12344255,transparent_60%)]"
      />

      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-7 sm:px-10">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-3 rounded-full bg-cyan-300 shadow-[0_0_18px_#22d3ee80]"
          />
          <span className="text-2xl font-semibold tracking-tight">Pulse</span>
        </div>

        <span className="font-mono text-xs tracking-widest text-slate-400">
          NO ACCOUNT NEEDED
        </span>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-4 px-6 py-10 sm:px-10 lg:grid-cols-[1fr_1.1fr] lg:gap-8 lg:py-16">
        <section className="relative z-10 max-w-xl">
          <p className="mb-6 font-mono text-xs tracking-[0.2em] text-cyan-300">
            SAME PLANET. A NEW PERSPECTIVE.
          </p>

          <h1 className="text-5xl leading-[1.04] font-semibold tracking-[-0.05em] sm:text-7xl">
            A small hello.
            <br />
            <span className="text-cyan-300">A wider world.</span>
          </h1>

          <p className="mt-7 max-w-md text-lg leading-relaxed text-slate-300">
            Somewhere, someone has a story you haven’t heard.
            Find a dot on the globe, say hello, and see where it goes.
          </p>

          <div className="mt-9">
            <button
              type="button"
              onClick={enter}
              disabled={busy}
              aria-busy={busy}
              aria-describedby="entry-location"
              className="inline-flex min-h-14 min-w-52 items-center justify-center gap-5 rounded-xl bg-cyan-300 px-7 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-65 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              {buttonLabel}
              {!busy && <span aria-hidden="true">↗</span>}
            </button>

            <p
              id="entry-location"
              className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400"
            >
              We’ll ask for location access to place your dot approximately
              1–3 km from your actual location.
            </p>

            <p className="sr-only" role="status">
              {busy ? buttonLabel : ""}
            </p>

            {error && (
              <p
                role="alert"
                className="mt-5 max-w-md rounded-xl border border-red-400/25 bg-red-400/5 px-4 py-3 text-sm leading-relaxed text-red-200"
              >
                {error}
              </p>
            )}
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/10 pt-6 text-sm text-slate-300">
            <span>Text first</span>
            <span>Video by invitation</span>
            <span>Leave anytime</span>
          </div>
        </section>

        <div className="mx-auto w-full max-w-sm lg:max-w-none">
          <EntryGlobe />
        </div>
      </div>

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-3 border-t border-white/10 px-6 py-6 text-xs leading-relaxed text-slate-400 sm:px-10 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-xl">
          Chat and video aren’t stored by Pulse. Temporary connection data
          is cleared automatically.
        </p>
        <p className="font-mono tracking-wider">
          REAL PEOPLE. PASSING MOMENTS.
        </p>
      </footer>
    </main>
  );
}