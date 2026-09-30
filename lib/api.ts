import type { PollResponse, SignalType } from "@/lib/types";
import { DEFAULT_INTENTION, type Intention } from "@/lib/intentions";

const tokens = new Map<string, string>();

function getOrCreateToken(id: string): string {
  const existing = tokens.get(id);
  if (existing) return existing;

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  tokens.set(id, token);
  return token;
}

function authHeaders(id: string): Record<string, string> {
  const token = tokens.get(id);

  if (!token) {
    throw new PresenceExpiredError();
  }

  return { Authorization: `Bearer ${token}` };
}

export class PresenceExpiredError extends Error {
  constructor() {
    super("Your session is unavailable. Please rejoin.");
    this.name = "PresenceExpiredError";
  }
}

export async function join(
  id: string,
  lat: number,
  lng: number,
  intention: Intention = DEFAULT_INTENTION,
): Promise<void> {
  const token = getOrCreateToken(id);

  const res = await fetch("/api/join", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id, lat, lng, intention }),
  });

  if (!res.ok) {
    throw new Error(`join failed: ${res.status}`);
  }
}

export async function poll(id: string): Promise<PollResponse> {
  const res = await fetch(`/api/poll?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: authHeaders(id),
  });

  if ([401, 403, 410].includes(res.status)) {
    throw new PresenceExpiredError();
  }

  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return res.json();
}

export async function sendSignal(
  fromId: string,
  toId: string,
  type: SignalType,
  connectionId: string,
  payload?: string,
): Promise<void> {
  const res = await fetch("/api/signal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(fromId),
    },
    body: JSON.stringify({
      fromId,
      toId,
      type,
      payload,
      connectionId,
    }),
  });

  if (!res.ok) {
    throw new Error(`signal failed: ${res.status}`);
  }
}

export function leave(id: string): void {
  const token = tokens.get(id);
  if (!token) return;

  // sendBeacon cannot set an Authorization header.
  const body = JSON.stringify({ id, token });

  if (
    typeof navigator !== "undefined" &&
    navigator.sendBeacon &&
    navigator.sendBeacon("/api/leave", body)
  ) {
    return;
  }

  void fetch("/api/leave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Presence expiry handles a failed leave request.
  });
}
