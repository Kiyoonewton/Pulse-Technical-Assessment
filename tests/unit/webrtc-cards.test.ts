// Focused tests for PeerSession's data-channel message handling.
//
// Node has no WebRTC, so RTCPeerConnection and RTCDataChannel are replaced
// with minimal fakes. These tests prove how PeerSession parses, validates and
// sends card messages. They do NOT prove that real browsers can establish a
// peer connection or exchange media — that is verified manually (TESTING.md).
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { ICEBREAKERS, type IcebreakerId } from "@/lib/icebreakers";
import { PeerSession, type PeerControl } from "@/lib/webrtc";

class FakeDataChannel {
  readyState: RTCDataChannelState = "connecting";
  sent: string[] = [];
  failOnSend = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  send(data: string) {
    if (this.failOnSend) throw new Error("InvalidStateError");
    this.sent.push(data);
  }

  close() {
    this.readyState = "closed";
  }

  // Simulate the remote peer sending raw data over the channel.
  receive(data: unknown) {
    this.onmessage?.({ data });
  }
}

class FakePeerConnection {
  static last: FakePeerConnection;
  channel = new FakeDataChannel();

  constructor() {
    FakePeerConnection.last = this;
  }

  createDataChannel() {
    return this.channel;
  }

  close() {}
}

(globalThis as Record<string, unknown>).RTCPeerConnection = FakePeerConnection;

interface Received {
  cards: IcebreakerId[];
  chats: string[];
  controls: PeerControl[];
}

function createSession() {
  const received: Received = { cards: [], chats: [], controls: [] };

  const session = new PeerSession(true, {
    onSignal: () => {},
    onChat: (text) => received.chats.push(text),
    onControl: (ctrl) => received.controls.push(ctrl),
    onRemoteStream: () => {},
    onConnectionState: () => {},
    onChannelOpen: () => {},
    onIcebreaker: (id) => received.cards.push(id),
  });

  return { session, channel: FakePeerConnection.last.channel, received };
}

describe("conversation cards over the data channel", () => {
  let ctx: ReturnType<typeof createSession>;

  beforeEach(() => {
    ctx = createSession();
  });

  test("every known card id invokes the card callback", () => {
    for (const card of ICEBREAKERS) {
      ctx.channel.receive(JSON.stringify({ t: "icebreaker", id: card.id }));
    }

    assert.deepEqual(
      ctx.received.cards,
      ICEBREAKERS.map((card) => card.id),
    );
  });

  test("unknown card ids are ignored", () => {
    for (const id of ["made-up", "", "CURIOSITY", 3, null, { id: "curiosity" }]) {
      ctx.channel.receive(JSON.stringify({ t: "icebreaker", id }));
    }
    // Free text in place of an id must never reach the card UI.
    ctx.channel.receive(
      JSON.stringify({ t: "icebreaker", id: "<img src=x onerror=alert(1)>" }),
    );

    assert.deepEqual(ctx.received, { cards: [], chats: [], controls: [] });
  });

  test("malformed data-channel messages are ignored without throwing", () => {
    const malformed = [
      "not json",
      "{",
      "null",
      "42",
      '"icebreaker"',
      "[]",
      JSON.stringify({ t: "icebreaker" }),
      JSON.stringify({ id: "curiosity" }),
      JSON.stringify({ t: "chat", text: 7 }),
      new ArrayBuffer(8),
    ];

    for (const data of malformed) {
      assert.doesNotThrow(() => ctx.channel.receive(data));
    }

    assert.deepEqual(ctx.received, { cards: [], chats: [], controls: [] });
  });

  test("sending a card on an open channel transmits only its id", () => {
    ctx.channel.readyState = "open";

    assert.equal(ctx.session.sendIcebreaker("curiosity"), true);
    assert.deepEqual(ctx.channel.sent.map((s) => JSON.parse(s)), [
      { t: "icebreaker", id: "curiosity" },
    ]);
  });

  test("sending a card reports failure when the channel is not open", () => {
    for (const state of ["connecting", "closing", "closed"] as const) {
      ctx.channel.readyState = state;
      assert.equal(ctx.session.sendIcebreaker("curiosity"), false, state);
    }

    assert.deepEqual(ctx.channel.sent, []);
  });

  test("sending a card reports failure when the channel throws", () => {
    ctx.channel.readyState = "open";
    ctx.channel.failOnSend = true;

    assert.equal(ctx.session.sendIcebreaker("curiosity"), false);
  });

  test("sending an unknown card id is refused", () => {
    ctx.channel.readyState = "open";

    assert.equal(
      ctx.session.sendIcebreaker("made-up" as IcebreakerId),
      false,
    );
    assert.deepEqual(ctx.channel.sent, []);
  });
});
