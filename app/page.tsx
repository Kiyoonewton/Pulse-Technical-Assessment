"use client";

import { useEffect, useRef, useState } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import { join, leave, poll, sendSignal, PresenceExpiredError } from "@/lib/api";
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { type PeerDot, type SignalMsg } from "@/lib/types";
import ParticipantPreview from "./components/ParticipantPreview";

type Conn =
  | { kind: "idle" }
  | {
    kind: "requesting" | "incoming" | "connecting" | "connected";
    peerId: string;
    connectionId: string;
  };

type VideoState = "none" | "requesting" | "incoming" | "active";

const REQUEST_TIMEOUT_MS = 30_000;

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);

  function selectPeer(peerId: string) {
    if (connRef.current.kind !== "idle") return;

    previewTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    setSelectedPeerId(peerId);
  }

  function closePreview() {
    setSelectedPeerId(null);

    const trigger = previewTriggerRef.current;
    if (trigger?.isConnected) trigger.focus();
  }

  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const retiredConnections = useRef(new Set<string>());
  const requestSendRef = useRef<{
    connectionId: string;
    promise: Promise<void>;
  } | null>(null);

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3500);
  }

  function addMessage(mine: boolean, text: string) {
    setMessages((prev) => [...prev, { id: msgId.current++, mine, text }]);
  }

  function teardown(message?: string) {
    const current = connRef.current;

    if (current.kind !== "idle") {
      retiredConnections.current.add(current.connectionId);
    }

    if (requestTimer.current) {
      clearTimeout(requestTimer.current);
      requestTimer.current = null;
    }

    // Invalidate old callbacks before closing their WebRTC session.
    setConn({ kind: "idle" });

    const oldPeer = peerRef.current;
    peerRef.current = null;
    oldPeer?.close();

    setSelectedPeerId(null);
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
    setMessages([]);

    if (message) showNotice(message);
  }

  function isCurrentConnection(connectionId: string): boolean {
    const current = connRef.current;
    return (
      current.kind !== "idle" &&
      current.connectionId === connectionId
    );
  }

  function startPeer(
    peerId: string,
    initiator: boolean,
    connectionId: string,
  ) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        if (!isCurrentConnection(connectionId)) return;

        void sendSignal(
          sessionId,
          peerId,
          type,
          connectionId,
          payload,
        ).catch(() => {
          if (isCurrentConnection(connectionId)) {
            showNotice("Could not send connection signal.");
          }
        });
      },
      onChat: (text) => {
        if (isCurrentConnection(connectionId)) {
          addMessage(false, text);
        }
      },
      onControl: (ctrl) => {
        if (isCurrentConnection(connectionId)) {
          handleControl(ctrl);
        }
      },
      onRemoteStream: (stream) => {
        if (isCurrentConnection(connectionId)) {
          setRemoteStream(stream);
        }
      },
      onConnectionState: (state) => {
        if (
          state === "failed" &&
          isCurrentConnection(connectionId)
        ) {
          teardown("Connection failed (network).");
        }
      },
      onChannelOpen: () => {
        if (isCurrentConnection(connectionId)) {
          setConn({ kind: "connected", peerId, connectionId });
        }
      },
    });

    peerRef.current = ps;
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          ps.startVideo()
            .then((stream) => {
              setLocalStream(stream);
              setVideo("active");
            })
            .catch(() => {
              setVideo("none");
              ps.sendControl("video-end");
              showNotice("Camera unavailable.");
            });
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          setVideo("none");
          showNotice("Video declined.");
        }
        break;
      case "video-end":
        ps?.stopVideo();
        setLocalStream(null);
        setRemoteStream(null);
        setVideo("none");
        break;
    }
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;

    const target = peers.find((peer) => peer.id === peerId);

    if (!target || target.busy) {
      showNotice("This stranger is no longer available.");
      return;
    }

    setSelectedPeerId(null);

    const connectionId = crypto.randomUUID();
    setConn({ kind: "requesting", peerId, connectionId });

    const promise = sendSignal(
      sessionId,
      peerId,
      "request",
      connectionId,
    );

    requestSendRef.current = { connectionId, promise };

    void promise.catch(() => {
      if (isCurrentConnection(connectionId)) {
        teardown("Could not send connection request.");
      }
    });

    requestTimer.current = setTimeout(() => {
      const current = connRef.current;

      if (
        current.kind === "requesting" &&
        current.connectionId === connectionId
      ) {
        cancelRequest("No answer.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function cancelRequest(message?: string) {
    const current = connRef.current;
    if (current.kind !== "requesting") return;

    const pending = requestSendRef.current;
    teardown(message);

    // Ensure cancellation cannot reach the server before its request.
    void (async () => {
      try {
        if (pending?.connectionId === current.connectionId) {
          await pending.promise;
        }

        await sendSignal(
          sessionId,
          current.peerId,
          "end",
          current.connectionId,
        );
      } catch {
        // A failed or already-expired request needs no further action.
        // Pending server reservations also expire automatically.
      }
    })();
  }

  async function acceptIncoming() {
    const current = connRef.current;
    if (current.kind !== "incoming") return;

    const { peerId, connectionId } = current;

    setConn({ kind: "connecting", peerId, connectionId });
    startPeer(peerId, false, connectionId);

    try {
      await sendSignal(sessionId, peerId, "accept", connectionId);
    } catch {
      if (isCurrentConnection(connectionId)) {
        teardown("Could not accept connection.");
      }
    }
  }

  function declineIncoming() {
    const current = connRef.current;
    if (current.kind !== "incoming") return;

    teardown();

    void sendSignal(
      sessionId,
      current.peerId,
      "decline",
      current.connectionId,
    ).catch(() => {
      showNotice("Could not deliver decline; request will expire.");
    });
  }

  function endConnection() {
    const current = connRef.current;

    if (
      current.kind !== "connecting" &&
      current.kind !== "connected"
    ) {
      return;
    }

    teardown();

    void sendSignal(
      sessionId,
      current.peerId,
      "end",
      current.connectionId,
    ).catch(() => {
      showNotice("Disconnected locally; could not notify the stranger.");
    });
  }
  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        ps.sendControl("video-accept");
        setVideo("active");
      })
      .catch(() => {
        ps.sendControl("video-decline");
        setVideo("none");
        showNotice("Camera unavailable.");
      });
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function endVideo() {
    const ps = peerRef.current;
    ps?.stopVideo();
    ps?.sendControl("video-end");
    setLocalStream(null);
    setRemoteStream(null);
    setVideo("none");
  }

  async function processSignal(sig: SignalMsg) {
    const connectionId = sig.connectionId;

    // Ignore legacy signals and connections already closed locally.
    if (
      !connectionId ||
      retiredConnections.current.has(connectionId)
    ) {
      return;
    }

    const current = connRef.current;

    if (sig.type === "request") {
      if (current.kind === "idle") {
        setConn({
          kind: "incoming",
          peerId: sig.fromId,
          connectionId,
        });
      } else if (current.connectionId !== connectionId) {
        retiredConnections.current.add(connectionId);

        await sendSignal(
          sessionId,
          sig.fromId,
          "decline",
          connectionId,
        ).catch(() => {
          // The server may already have expired this request.
        });
      }

      return;
    }

    // Match BOTH the participant and the particular connection attempt.
    if (
      current.kind === "idle" ||
      current.peerId !== sig.fromId ||
      current.connectionId !== connectionId
    ) {
      return;
    }

    switch (sig.type) {
      case "accept":
        if (current.kind === "requesting") {
          if (requestTimer.current) {
            clearTimeout(requestTimer.current);
            requestTimer.current = null;
          }

          setConn({
            kind: "connecting",
            peerId: sig.fromId,
            connectionId,
          });

          startPeer(sig.fromId, true, connectionId);
        }
        break;

      case "decline":
        if (current.kind === "requesting") {
          teardown("Request declined.");
        }
        break;

      case "offer":
      case "answer":
      case "ice":
        if (
          (current.kind === "connecting" ||
            current.kind === "connected") &&
          peerRef.current
        ) {
          try {
            await peerRef.current.handleSignal(
              sig.type,
              sig.payload ?? "",
            );
          } catch {
            if (isCurrentConnection(connectionId)) {
              showNotice("Could not process connection signal.");
            }
          }
        }
        break;

      case "end":
        teardown(
          current.kind === "requesting" ||
            current.kind === "incoming"
            ? "Connection request ended."
            : "Stranger disconnected.",
        );
        break;
    }
  }

  const processSignalRef = useRef(processSignal);
  const teardownRef = useRef(teardown);

  useEffect(() => {
    processSignalRef.current = processSignal;
    teardownRef.current = teardown;
  });

  useEffect(() => {
    if (phase !== "live" || !sessionId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await poll(sessionId);
        if (!active) return;
        setPeers(data.peers);
        for (const s of data.signals) {
          if (!active) return;
          await processSignalRef.current(s);
        }
      } catch (error) {
        if (!active) return;

        if (error instanceof PresenceExpiredError) {
          teardownRef.current();
          setPeers([]);
          setPhase("gate");
          return;
        }
      }
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase, sessionId]);

  useEffect(() => {
    if (!sessionId || phase !== "live") return;
    const onLeave = () => leave(sessionId);
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
    };
  }, [sessionId, phase]);

  async function handleReady(lat: number, lng: number) {
    setMyLocation({ lat, lng });
    await join(sessionId, lat, lng);
    setPhase("live");
  }

  if (phase === "gate") {
    return <EntryGate onReady={handleReady} />;
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";

  return (
    <main className="fixed inset-0 overflow-hidden">
      <WorldMap
        peers={peers}
        me={myLocation}
        onPeerClick={selectPeer}
        canConnect={conn.kind === "idle"}
      />

      {conn.kind === "idle" && selectedPeerId !== null && (
        <ParticipantPreview
          key={selectedPeerId}
          peer={peers.find((peer) => peer.id === selectedPeerId)}
          onConnect={() => requestConnection(selectedPeerId)}
          onClose={closePreview}
        />
      )}

      {notice && (
        <div className="absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          {notice}
        </div>
      )}

      {conn.kind === "requesting" && (
        <div className="absolute left-1/2 top-20 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          <span>Requesting connection…</span>
          <button
            onClick={() => cancelRequest()} className="rounded-full bg-zinc-700 px-3 py-1 text-xs hover:bg-zinc-600"
          >
            Cancel
          </button>
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="A stranger wants to connect"
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
        />
      )}

      {inChat && (
        <ChatPanel
          messages={messages}
          connected={conn.kind === "connected"}
          videoBusy={video !== "none"}
          onSend={(text) => {
            peerRef.current?.sendChat(text);
            addMessage(true, text);
          }}
          onStartVideo={startVideoRequest}
          onEnd={endConnection}
        />
      )}

      {video === "requesting" && (
        <div className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-zinc-800/90 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          Waiting for stranger to accept video…
        </div>
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          title="Start video call?"
          subtitle="The stranger wants to turn on video."
          acceptLabel="Accept"
          declineLabel="Decline"
          onAccept={acceptVideo}
          onDecline={declineVideo}
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          onEnd={endVideo}
        />
      )}
    </main>
  );
}
