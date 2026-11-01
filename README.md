# Tilt Arena 🎮

Party game แนว Jackbox: **จอใหญ่ 1 จอ** แสดงเกม ทุกคน **สแกน QR ด้วยมือถือตัวเอง** แล้วเอียงมือถือกลิ้งลูกบอล ชนเพื่อนให้ตกเวทีที่ค่อยๆ หดลง คนสุดท้ายที่รอดชนะ

- **Frontend:** Next.js 16 + TypeScript (`apps/web`)
- **Backend:** Bun + Elysia + TypeScript, WebSocket (`apps/server`)
- **Shared:** message types ที่ใช้ร่วมกันทั้ง 3 ฝั่ง (`packages/shared`)

```
tilt-arena/
├─ apps/
│  ├─ web/                  # Next.js
│  │  ├─ app/page.tsx       # หน้าแรก: สร้างห้อง / ใส่รหัส
│  │  ├─ app/host/          # จอใหญ่: QR, lobby, เกม (canvas)
│  │  ├─ app/play/[room]/   # มือถือ: คอนโทรลเลอร์ (เอียง + ปุ่ม DASH)
│  │  └─ lib/game.ts        # ฟิสิกส์และกติกาเกม (รันบนจอใหญ่เท่านั้น)
│  └─ server/               # Elysia: จัดห้อง + ส่งต่อข้อความ
│     └─ src/index.ts
└─ packages/shared/src/index.ts   # types ของทุก message
```

## การทำงาน

```
มือถือ ──tilt/dash/start──▶ Elysia ──▶ จอใหญ่ (คำนวณเกมทั้งหมด)
มือถือ ◀──status (playing/out/winner)── Elysia ◀── จอใหญ่
```

เซิร์ฟเวอร์ไม่มี logic เกม แค่จับคู่ห้องกับส่งต่อข้อความ จึงเบามากและเพิ่มเกมใหม่ได้โดยแก้แค่ฝั่งเว็บ

## รันในเครื่อง

ต้องมี [Bun](https://bun.sh) 1.2+

```bash
bun install
bun run dev          # รันทั้ง server (:3001) และ web (:3000)
```

เปิด http://localhost:3000/host บนคอมพ์ แล้วกด **B** เพื่อเพิ่มบอทลองเล่นคนเดียวได้ กด **Space** เพื่อเริ่ม

### ลองกับมือถือจริง

เซ็นเซอร์มือถือใช้ได้เฉพาะ **HTTPS** (iOS เข้มงวดสุด) วิธีง่ายสุดคือเปิด tunnel 2 ตัว:

```bash
# terminal 1
bun run dev
# terminal 2  (server)
cloudflared tunnel --url http://localhost:3001
# terminal 3  (web) ใส่ URL ของ server จาก terminal 2
NEXT_PUBLIC_WS_URL=wss://<server-tunnel>.trycloudflare.com/ws bun run dev:web
cloudflared tunnel --url http://localhost:3000
```

แล้วเปิด `https://<web-tunnel>.trycloudflare.com/host` บนจอใหญ่ มือถือสแกน QR ได้เลย

> ถ้าเปิดผ่าน IP ในวง LAN (http) ก็เล่นได้ แต่มือถือจะสลับไปใช้ **จอยสัมผัส** แทนการเอียงอัตโนมัติ

## Deploy

### 1) Server (Elysia) → Railway / Fly.io / Render

ต้องเป็นเซิร์ฟเวอร์ที่รันค้างไว้ (ห้องเก็บในหน่วยความจำ) มี `apps/server/Dockerfile` ให้แล้ว

**Railway:** New Project → Deploy from GitHub repo → เลือก repo นี้ (มี `railway.json` ชี้ไปที่ Dockerfile แล้ว) → Settings → Networking → Generate Domain

ได้ URL เช่น `https://tilt-arena-server.up.railway.app` → WebSocket คือ `wss://tilt-arena-server.up.railway.app/ws`

**Fly.io / Render:** ใช้ Dockerfile เดียวกัน build จาก root ของ repo:
```bash
docker build -f apps/server/Dockerfile -t tilt-server .
```

### 2) Web (Next.js) → Vercel

Import repo บน Vercel แล้วตั้งค่า:

| Setting | Value |
| --- | --- |
| Root Directory | `apps/web` |
| Framework | Next.js (auto) |
| Environment Variable | `NEXT_PUBLIC_WS_URL` = `wss://<server-domain>/ws` |

Vercel อ่าน `bun.lock` ที่ root และติดตั้ง workspace ให้เอง

## กติกา & การควบคุม

| | |
| --- | --- |
| เอียงมือถือ | กลิ้งลูกบอล |
| DASH 💨 | พุ่งไปทางที่เอียง (คูลดาวน์ 1.6 วิ) |
| ตั้งศูนย์ | ตั้งมุมที่ถืออยู่ตอนนี้เป็นจุดนิ่ง |
| 👑 หัวห้อง | คนแรกที่เข้าห้อง กดเริ่มเกมจากมือถือได้ |
| จอใหญ่: Space / B | เริ่มเกม / เพิ่มบอท |

ค่าปรับเกม (ขนาดเวที, ความเร็ว, แรง dash) อยู่ด้านบนของ `apps/web/lib/game.ts`

## ต่อยอด

- เพิ่มเกมใหม่: สร้าง `lib/<game>.ts` + หน้า host ใหม่ ใช้ server ตัวเดิมได้เลย
- Reconnect: เก็บ player id ใน `localStorage` แล้วให้ server ผูกกลับเข้าที่เดิม
- Eden Treaty (`@elysiajs/eden`): server export `type App` ไว้แล้ว ใช้เรียก HTTP route แบบ type-safe จาก Next ได้
