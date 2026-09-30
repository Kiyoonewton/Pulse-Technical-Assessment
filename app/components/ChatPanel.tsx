"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ICEBREAKERS, type IcebreakerId } from "@/lib/icebreakers";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
  kind?: "icebreaker";
}

export default function ChatPanel({
  messages,
  connected,
  videoBusy,
  videoActive = false,
  onSend,
  onShareIcebreaker,
  onStartVideo,
  onEnd,
}: {
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  videoActive?: boolean;
  onSend: (text: string) => void;
  onShareIcebreaker: (id: IcebreakerId) => boolean;
  onStartVideo: () => void;
  onEnd: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const [nextCardIndex, setNextCardIndex] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const followLatestRef = useRef(true);

  useEffect(() => {
    const container = scrollRef.current;

    if (container && followLatestRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = draft.trim();
    if (!text || !connected) return;

    try {
      followLatestRef.current = true;
      onSend(text);
      setDraft("");
      setSendError("");
      inputRef.current?.focus();
    } catch {
      setSendError("Couldn't send that message. Please try again.");
    }
  }

  function shareCard() {
    const card = ICEBREAKERS[nextCardIndex % ICEBREAKERS.length];

    if (onShareIcebreaker(card.id)) {
      followLatestRef.current = true;
      setNextCardIndex((index) => index + 1);
    }
  }

  return (
    <section
      aria-label="Conversation"
      className={`absolute z-20 flex min-h-0 flex-col overflow-hidden border-cyan-300/15 bg-[#111622] text-slate-100 shadow-2xl ${videoActive
        ? "inset-x-0 bottom-0 top-[42%] border-t lg:inset-y-4 lg:right-4 lg:left-auto lg:w-[440px] lg:rounded-2xl lg:border"
        : "inset-0 sm:inset-y-4 sm:right-4 sm:left-auto sm:w-[min(440px,calc(100%-2rem))] sm:rounded-2xl sm:border"
        }`}
    >
      <header className="shrink-0 border-b border-white/10 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/5"
            >
              <span className="size-3 rounded-full bg-cyan-300" />
            </div>

            <div>
              <h2 className="font-semibold">Stranger</h2>
              <p
                role="status"
                className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"
              >
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                />
                {connected ? "Connected" : "Connecting…"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onEnd}
            className="min-h-11 shrink-0 rounded-xl border border-red-400/35 px-4 text-sm font-medium text-red-300 hover:bg-red-400/10"
          >
            End chat
          </button>
        </div>

        {!videoActive && (
          <button
            type="button"
            onClick={onStartVideo}
            disabled={!connected || videoBusy}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/5 px-4 text-sm text-cyan-200 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="size-5"
            >
              <rect x="3" y="6" width="12" height="12" rx="3" />
              <path
                d="m15 10 6-3v10l-6-3"
                strokeLinejoin="round"
              />
            </svg>
            {videoBusy ? "Video in progress" : "Invite to video"}
          </button>)}
      </header>

      <div
        ref={scrollRef}
        onScroll={() => {
          const container = scrollRef.current;
          if (!container) return;

          followLatestRef.current =
            container.scrollHeight -
            container.scrollTop -
            container.clientHeight <
            80;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5"
      >
        {messages.length === 0 && (
          <div className="mx-auto flex max-w-xs flex-col items-center py-12 text-center">
            <div
              aria-hidden="true"
              className="mb-5 flex size-14 items-center justify-center rounded-full border border-cyan-300/20 text-2xl text-cyan-300"
            >
              ✦
            </div>

            <h3 className="text-xl font-semibold tracking-tight">
              {connected ? "Every conversation starts somewhere." : "A hello is on its way."}
            </h3>

            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              {connected
                ? "Say hello, ask about their day, or share something that made you smile."
                : "Establishing your connection. You can start typing once it’s ready."}
            </p>
          </div>
        )}

        <div
          role="log"
          aria-label="Messages"
          aria-live="polite"
          aria-relevant="additions"
          className="space-y-3"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.mine ? "justify-end" : "justify-start"
                }`}
            >
              {message.kind === "icebreaker" ? (
                <div className="w-full rounded-2xl border border-cyan-300/25 bg-cyan-300/5 p-4">
                  <p className="font-mono text-xs tracking-wider text-cyan-300">
                    {message.mine ? "YOU SHARED A CARD" : "STRANGER SHARED A CARD"}
                  </p>

                  <p className="mt-3 text-base leading-relaxed text-slate-100">
                    {message.text}
                  </p>

                  <p className="mt-3 text-xs text-slate-400">
                    Answer if you like. Skipping is fine.
                  </p>
                </div>
              ) : (
                <p
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-base leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${message.mine
                    ? "rounded-br-sm border border-cyan-300/15 bg-[#12333f] text-cyan-50"
                    : "rounded-bl-sm border border-white/5 bg-[#1b2432] text-slate-100"
                    }`}
                >
                  <span className="sr-only">
                    {message.mine ? "You: " : "Stranger: "}
                  </span>
                  {message.text}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {sendError && (
          <p role="alert" className="mb-3 text-sm text-red-300">
            {sendError}
          </p>
        )}

        <button
          type="button"
          onClick={shareCard}
          disabled={!connected}
          className="mb-3 min-h-11 w-full rounded-xl border border-cyan-300/20 bg-cyan-300/5 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Share a conversation card
        </button>

        <form onSubmit={submit} className="flex items-center gap-2">
          <label htmlFor="chat-message" className="sr-only">
            Message
          </label>

          <input
            ref={inputRef}
            id="chat-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={connected ? "Say something…" : "Connecting…"}
            disabled={!connected}
            autoComplete="off"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0a0d14] px-4 text-base placeholder:text-slate-500 disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={!connected || !draft.trim()}
            className="min-h-12 shrink-0 rounded-xl bg-cyan-300 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </form>

        <p className="mt-3 text-center text-xs text-slate-400">
          Peer-to-peer conversation · Not stored by Pulse
        </p>
      </footer>
    </section>
  );
}