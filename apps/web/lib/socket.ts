"use client";

/**
 * Builds the WebSocket URL for the Elysia server.
 * - NEXT_PUBLIC_WS_URL wins (production: wss://your-server/ws)
 * - otherwise same host as the page, port 3001 (local dev on your LAN)
 */
export function wsUrl(query: Record<string, string>) {
  const base =
    process.env.NEXT_PUBLIC_WS_URL ||
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:3001/ws`;
  const url = new URL(base);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
}

export function send(ws: WebSocket | null, msg: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
