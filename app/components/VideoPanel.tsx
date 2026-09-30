"use client";

import { useEffect, useRef, useState } from "react";

export default function VideoPanel({
  localStream,
  remoteStream,
  onEnd,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEnd: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [needsPlayback, setNeedsPlayback] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const hasAudio = Boolean(
    localStream?.getAudioTracks().some((track) => track.readyState === "live"),
  );
  const hasVideo = Boolean(
    localStream?.getVideoTracks().some((track) => track.readyState === "live"),
  );

  useEffect(() => {
    const element = localRef.current;
    if (!element) return;

    element.srcObject = localStream;

    return () => {
      element.srcObject = null;
    };
  }, [localStream]);

  useEffect(() => {
    const element = remoteRef.current;
    if (!element) return;

    let cancelled = false;
    element.srcObject = remoteStream;

    if (remoteStream) {
      void element.play().then(
        () => {
          if (!cancelled) setNeedsPlayback(false);
        },
        () => {
          if (!cancelled) setNeedsPlayback(true);
        },
      );
    }

    return () => {
      cancelled = true;
      element.srcObject = null;
    };
  }, [remoteStream]);

  useEffect(() => {
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !micMuted;
    });
  }, [localStream, micMuted]);

  useEffect(() => {
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = !cameraOff;
    });
  }, [localStream, cameraOff]);

  useEffect(() => {
    if (!expanded) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded]);

  async function resumePlayback() {
    const element = remoteRef.current;
    if (!element) return;

    try {
      await element.play();
      setNeedsPlayback(false);
    } catch {
      setNeedsPlayback(true);
    }
  }

  return (
    <section
      aria-label="Video call"
      className={`absolute z-30 flex min-h-0 flex-col overflow-hidden bg-[#080c12] ${expanded
        ? "inset-0"
        : "inset-x-0 top-0 h-[42%] lg:inset-y-4 lg:left-4 lg:right-[472px] lg:h-auto lg:rounded-2xl lg:border lg:border-cyan-300/20"
        }`}
    >
      <div className="relative min-h-0 flex-1">
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          aria-label="Stranger's video"
          className="absolute inset-0 h-full w-full object-contain"
        />
        <button
          type="button"
          aria-label={expanded ? "Restore video and chat layout" : "Expand video"}
          title={expanded ? "Restore layout (Esc)" : "Expand video"}
          onClick={() => setExpanded((current) => !current)}
          className="absolute top-3 right-3 z-10 flex size-11 items-center justify-center rounded-xl border border-white/15 bg-black/65 text-white hover:bg-black/85"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5"
          >
            {expanded ? (
              <path d="M4 9h5V4m11 5h-5V4M4 15h5v5m11-5h-5v5" />
            ) : (
              <path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5" />
            )}
          </svg>
        </button>

        {!remoteStream && (
          <div
            role="status"
            className="absolute inset-0 flex items-center justify-center px-5 text-center text-sm text-slate-400"
          >
            Waiting for the stranger’s video…
          </div>
        )}

        <div className="absolute top-3 left-3 rounded-lg border border-white/10 bg-black/65 px-3 py-2 text-xs text-slate-200">
          Stranger
        </div>

        {needsPlayback && remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <button
              type="button"
              onClick={() => void resumePlayback()}
              className="min-h-11 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950"
            >
              Play video and audio
            </button>
          </div>
        )}

        <div className="absolute right-3 bottom-3 h-[42%] max-h-44 w-20 overflow-hidden rounded-xl border border-white/20 bg-[#111622] sm:w-28">
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            aria-label="Your video preview"
            className="h-full w-full -scale-x-100 object-cover"
          />

          {(cameraOff || !hasVideo) && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#111622] px-2 text-center text-xs text-slate-300">
              {cameraOff ? "Camera off" : "No camera"}
            </div>
          )}

          <span className="absolute bottom-1 left-1 rounded bg-black/65 px-2 py-1 text-[10px] text-white">
            You
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-[#111622] p-2 sm:p-3">
        <button
          type="button"
          disabled={!hasAudio}
          aria-pressed={micMuted}
          aria-label="Mute microphone"
          onClick={() => setMicMuted((muted) => !muted)}
          className={`min-h-11 rounded-xl border px-3 text-xs font-medium sm:text-sm ${micMuted
            ? "border-amber-300/35 bg-amber-300/10 text-amber-200"
            : "border-white/15 text-slate-200 hover:bg-white/5"
            } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {!hasAudio ? "No mic" : micMuted ? "Mic muted" : "Mic on"}
        </button>

        <button
          type="button"
          disabled={!hasVideo}
          aria-pressed={cameraOff}
          aria-label="Turn camera off"
          onClick={() => setCameraOff((off) => !off)}
          className={`min-h-11 rounded-xl border px-3 text-xs font-medium sm:text-sm ${cameraOff
            ? "border-amber-300/35 bg-amber-300/10 text-amber-200"
            : "border-white/15 text-slate-200 hover:bg-white/5"
            } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {!hasVideo ? "No camera" : cameraOff ? "Camera off" : "Camera on"}
        </button>

        <button
          type="button"
          onClick={onEnd}
          className="min-h-11 rounded-xl bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500 sm:px-5 sm:text-sm"
        >
          End video
        </button>
      </div>
    </section>
  );
}