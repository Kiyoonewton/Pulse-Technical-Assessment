// Calls the real route handlers in-process with real Request objects, so the
// tests exercise the same validation, auth and database code as production.
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { POST as joinRoute } from "@/app/api/join/route";
import { POST as leaveRoute } from "@/app/api/leave/route";
import { GET as pollRoute } from "@/app/api/poll/route";
import { POST as signalRoute } from "@/app/api/signal/route";
import type { PollResponse, SignalType } from "@/lib/types";

const ORIGIN = "http://localhost:3000";

export interface Session {
  id: string;
  token: string;
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

function jsonRequest(path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;

  return new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export function join(
  body: Record<string, unknown>,
  token?: string,
): Promise<Response> {
  return joinRoute(jsonRequest("/api/join", body, token));
}

export async function joinSession(
  extra: Record<string, unknown> = {},
): Promise<Session> {
  const session = { id: randomUUID(), token: newToken() };
  const response = await join(
    { id: session.id, lat: 6.5244, lng: 3.3792, ...extra },
    session.token,
  );

  if (response.status !== 200) {
    throw new Error(`join failed with ${response.status}`);
  }

  return session;
}

export function poll(id: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;

  return pollRoute(
    new NextRequest(`${ORIGIN}/api/poll?id=${encodeURIComponent(id)}`, {
      headers,
    }),
  );
}

export async function pollOk(session: Session): Promise<PollResponse> {
  const response = await poll(session.id, session.token);
  if (response.status !== 200) {
    throw new Error(`poll failed with ${response.status}`);
  }
  return (await response.json()) as PollResponse;
}

export function signal(
  body: {
    fromId: string;
    toId: string;
    type: SignalType | string;
    connectionId: string;
    payload?: string | null;
  },
  token?: string,
): Promise<Response> {
  return signalRoute(jsonRequest("/api/signal", body, token));
}

export function send(
  from: Session,
  to: Session | string,
  type: SignalType,
  connectionId: string,
  payload?: string,
): Promise<Response> {
  return signal(
    {
      fromId: from.id,
      toId: typeof to === "string" ? to : to.id,
      type,
      connectionId,
      payload,
    },
    from.token,
  );
}

// The leave endpoint takes the token in the body (it is sent via sendBeacon).
export function leave(id: string, token: unknown): Promise<Response> {
  return leaveRoute(jsonRequest("/api/leave", { id, token }));
}

// Requester asks, recipient accepts: returns the ACTIVE connection id.
export async function connect(
  requester: Session,
  recipient: Session,
): Promise<string> {
  const connectionId = randomUUID();

  const requested = await send(requester, recipient, "request", connectionId);
  if (requested.status !== 200) {
    throw new Error(`request failed with ${requested.status}`);
  }

  const accepted = await send(recipient, requester, "accept", connectionId);
  if (accepted.status !== 200) {
    throw new Error(`accept failed with ${accepted.status}`);
  }

  return connectionId;
}

export async function errorOf(response: Response): Promise<string> {
  const body = (await response.json()) as { error?: string };
  return body.error ?? "";
}
