"use client";

import { useEffect, useId, useRef } from "react";

export default function ConnectionPrompt({
  title,
  subtitle,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
}: {
  title: string;
  subtitle?: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const handledRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    dialog.showModal();
    headingRef.current?.focus();

    return () => {
      dialog.close();

      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  function respond(action: () => void) {
    if (handledRef.current) return;

    handledRef.current = true;
    action();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={subtitle ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        respond(onDecline);
      }}
      className="pulse-dialog fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-cyan-300/25 bg-[#111622] p-6 text-slate-100 shadow-2xl sm:p-8"
    >
      <div className="flex items-center gap-2 font-mono text-xs tracking-widest text-cyan-300">
        <span
          aria-hidden="true"
          className="size-2 rounded-full bg-cyan-300"
        />
        AN INVITATION
      </div>

      <div
        aria-hidden="true"
        className="mx-auto mt-8 flex size-20 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/5"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="size-9 text-cyan-300"
        >
          <path
            d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 3v-6A7.5 7.5 0 0 1 4 4h8.5A7.5 7.5 0 0 1 20 11.5Z"
            strokeLinejoin="round"
          />
          <path d="M8 10h8M8 14h5" strokeLinecap="round" />
        </svg>
      </div>

      <h2
        id={titleId}
        ref={headingRef}
        tabIndex={-1}
        className="mt-6 text-center text-2xl leading-tight font-semibold tracking-tight"
      >
        {title}
      </h2>

      {subtitle && (
        <p
          id={descriptionId}
          className="mt-3 text-center text-base leading-relaxed text-slate-400"
        >
          {subtitle}
        </p>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => respond(onDecline)}
          className="min-h-12 rounded-xl border border-slate-600 px-3 py-3 font-medium text-slate-200 transition hover:border-slate-400 hover:bg-white/5"
        >
          {declineLabel}
        </button>

        <button
          type="button"
          onClick={() => respond(onAccept)}
          className="min-h-12 rounded-xl bg-cyan-300 px-3 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200"
        >
          {acceptLabel}
        </button>
      </div>

      <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">
        Your choice. You can leave at any time.
      </p>
    </dialog>
  );
}