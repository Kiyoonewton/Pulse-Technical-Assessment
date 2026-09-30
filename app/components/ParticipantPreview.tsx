"use client";

import { useEffect, useRef } from "react";
import type { PeerDot } from "@/lib/types";

export default function ParticipantPreview({
    peer,
    onConnect,
    onClose,
}: {
    peer: PeerDot | undefined;
    onConnect: () => void;
    onClose: () => void;
}) {
    const headingRef = useRef<HTMLHeadingElement>(null);

    useEffect(() => {
        headingRef.current?.focus();
    }, []);

    const available = Boolean(peer && !peer.busy);
    const label = peer
        ? `Stranger ${peer.id.slice(0, 4).toUpperCase()}`
        : "Stranger offline";

    return (
        <section
            aria-labelledby="participant-heading"
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    event.stopPropagation();
                    onClose();
                }
            }}
            className="absolute inset-x-4 bottom-12 z-20 max-h-[65dvh] overflow-y-auto rounded-2xl border border-cyan-300/20 bg-[#111622] p-6 shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-auto sm:top-24 sm:w-80"
        >
            <div className="flex items-center justify-between gap-4">
                <p className="font-mono text-xs tracking-widest text-slate-400">
                    SOMEONE ON THE GLOBE
                </p>

                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close participant preview"
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-xl text-slate-300 hover:bg-white/5 hover:text-white"
                >
                    <span aria-hidden="true">×</span>
                </button>
            </div>

            <div
                aria-hidden="true"
                className="mt-5 flex size-20 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/5"
            >
                <div className="flex size-12 items-center justify-center rounded-full border border-cyan-300/40">
                    <span className="size-4 rounded-full bg-cyan-300 shadow-[0_0_20px_#22d3ee60]" />
                </div>
            </div>

            <h2
                id="participant-heading"
                ref={headingRef}
                tabIndex={-1}
                className="mt-5 text-2xl font-semibold tracking-tight"
            >
                {label}
            </h2>

            <p
                role="status"
                className="mt-2 flex items-center gap-2 text-sm text-slate-300"
            >
                <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${!peer
                            ? "bg-slate-500"
                            : peer.busy
                                ? "bg-amber-400"
                                : "bg-cyan-300"
                        }`}
                />
                {!peer
                    ? "No longer on the map"
                    : peer.busy
                        ? "Currently in a conversation"
                        : "Available to connect"}
            </p>

            <p className="mt-6 text-sm leading-relaxed text-slate-400">
                Start with a hello. They can accept or decline, and either of you
                can leave anytime.
            </p>

            <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-relaxed text-slate-400">
                Temporary identity · Approximate map location
            </p>

            <button
                type="button"
                onClick={onConnect}
                disabled={!available}
                className="mt-6 min-h-12 w-full rounded-xl bg-cyan-300 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
            >
                {!peer
                    ? "No longer available"
                    : peer.busy
                        ? "Currently busy"
                        : "Request connection"}
            </button>

            <button
                type="button"
                onClick={onClose}
                className="mt-3 min-h-12 w-full rounded-xl border border-white/15 px-4 py-3 text-sm text-slate-300 hover:bg-white/5"
            >
                Back to globe
            </button>
        </section>
    );
}