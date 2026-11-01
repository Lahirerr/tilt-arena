"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { PLAYER_COLORS, type HostToServer, type ServerToHost } from "@tilt/shared";
import { Game, type Phase } from "@/lib/game";
import { send, wsUrl } from "@/lib/socket";

interface UiPlayer {
  id: string;
  name: string;
  color: string;
  wins: number;
  alive: boolean;
}

export default function HostPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const gameRef = useRef<Game | null>(null);

  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [players, setPlayers] = useState<UiPlayer[]>([]);
  const [winner, setWinner] = useState<string | null>(null);

  // ---- connect + game loop ----
  useEffect(() => {
    const game = new Game((id, status, text, vip) => {
      if (id.startsWith("bot-")) return;
      const msg: HostToServer = { t: "status", id, status, text, vip };
      send(wsRef.current, msg);
    });
    gameRef.current = game;

    const ws = new WebSocket(wsUrl({ role: "host" }));
    wsRef.current = ws;
    ws.onerror = () => setError("ต่อเซิร์ฟเวอร์ไม่ได้ เช็กว่า server รันอยู่ และ NEXT_PUBLIC_WS_URL ถูกต้อง");
    ws.onclose = () => setError((e) => e ?? "การเชื่อมต่อหลุด รีเฟรชเพื่อสร้างห้องใหม่");
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerToHost;
      switch (msg.t) {
        case "room": {
          setCode(msg.code);
          const url = `${location.origin}/play/${msg.code}`;
          setJoinUrl(url);
          QRCode.toDataURL(url, { margin: 1, width: 512 }).then(setQr);
          break;
        }
        case "join":
          game.join(msg.player);
          break;
        case "leave":
          game.leave(msg.id);
          break;
        case "tilt":
          game.tilt(msg.id, msg.x, msg.y);
          break;
        case "dash":
          game.dash(msg.id);
          break;
        case "start":
          game.requestStart(msg.id);
          break;
      }
    };

    // bots (press B) steer toward the nearest other ball, with some wobble
    const botTimer = setInterval(() => {
      const balls = [...game.balls.values()];
      for (const b of balls) {
        if (!b.info.id.startsWith("bot-") || !b.alive) continue;
        const target = balls.filter((o) => o !== b && o.alive).sort(
          (p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y),
        )[0];
        const tx = target ? target.x - b.x : 500 - b.x;
        const ty = target ? target.y - b.y : 500 - b.y;
        const len = Math.hypot(tx, ty) || 1;
        game.tilt(b.info.id, (tx / len) * 0.8 + (Math.random() - 0.5) * 0.6, (ty / len) * 0.8 + (Math.random() - 0.5) * 0.6);
        if (Math.random() < 0.02) game.dash(b.info.id);
      }
    }, 120);

    // render loop
    let raf = 0;
    let last = performance.now();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const loop = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      game.update((now - last) / 1000);
      last = now;
      game.render(ctx, w, h, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // mirror game state into React a few times a second for the overlays
    const uiTimer = setInterval(() => {
      setPhase(game.phase);
      setWinner(game.winner?.info.name ?? null);
      setPlayers(
        game.order.map((id) => {
          const b = game.balls.get(id)!;
          return { id, name: b.info.name, color: b.info.color, wins: b.wins, alive: b.alive };
        }),
      );
    }, 150);

    // keyboard: Space/Enter = start, B = add bot (handy for testing alone)
    let botN = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") game.requestStart();
      if (e.code === "KeyB" && game.phase === "lobby" && game.balls.size < 8) {
        botN++;
        game.join({ id: `bot-${botN}`, name: `Bot ${botN}`, color: PLAYER_COLORS[(game.balls.size + 3) % PLAYER_COLORS.length] });
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(botTimer);
      clearInterval(uiTimer);
      window.removeEventListener("keydown", onKey);
      ws.onclose = null;
      ws.close();
    };
  }, []);

  const vip = players[0];

  return (
    <main className="host">
      <canvas ref={canvasRef} />

      {phase !== "lobby" && (
        <div className="hud">
          <div className="room-tag">{code}</div>
          <div className="scoreboard">
            {players.map((p) => (
              <div key={p.id} style={{ opacity: p.alive || phase === "result" ? 1 : 0.4 }}>
                <span className="dot" style={{ background: p.color }} />
                <span style={{ flex: 1 }}>{p.name}</span>
                <span>🏆 {p.wins}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === "result" && (
        <div className="result-banner">{winner ? `🏆 ${winner} ชนะ!` : "จบรอบ!"}</div>
      )}

      {phase === "lobby" && (
        <div className="lobby">
          <div className="qr">{qr ? <img src={qr} alt="QR code to join" /> : <div style={{ aspectRatio: 1 }} />}</div>
          <div>
            <h1>
              Tilt<span>Arena</span>
            </h1>
            {error ? (
              <p className="error" style={{ marginTop: 24 }}>{error}</p>
            ) : (
              <>
                <p className="join-url">สแกน QR หรือเข้า {joinUrl ? new URL(joinUrl).host : "…"} แล้วใส่รหัส</p>
                <div className="big-code">{code ?? "····"}</div>
              </>
            )}
            <div className="chips">
              {players.map((p, i) => (
                <span key={p.id} className={`chip ${i === 0 ? "vip" : ""}`}>
                  <span className="dot" style={{ background: p.color }} />
                  {p.name}
                </span>
              ))}
            </div>
            <p className="hint">
              {players.length === 0
                ? "รอผู้เล่น… (กด B เพื่อเพิ่มบอทลองเล่น)"
                : `${vip?.name} 👑 กดเริ่มจากมือถือได้เลย · หรือกด Space`}
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
