#!/usr/bin/env bash
# One command for phone testing over HTTPS:
# server (:3001) + web (:3000) + a cloudflared quick tunnel for each.
# Ctrl+C stops everything.
set -uo pipefail
cd "$(dirname "$0")/.."

command -v cloudflared >/dev/null || { echo "ต้องติดตั้ง cloudflared ก่อน: brew install cloudflared"; exit 1; }
for port in 3000 3001; do
  if lsof -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then
    echo "พอร์ต $port ถูกใช้อยู่ ปิดตัวเก่าก่อน (lsof -iTCP:$port -sTCP:LISTEN)"
    exit 1
  fi
done

LOG=$(mktemp -d)
cleanup() { trap - EXIT INT TERM; echo; echo "กำลังปิดทั้งหมด…"; kill 0 2>/dev/null; }
trap cleanup EXIT INT TERM

# 127.0.0.1, not localhost: cloudflared tries [::1] first and Next only listens on IPv4
tunnel() { # <origin port> <metrics port>
  cloudflared tunnel --no-autoupdate --metrics "127.0.0.1:$2" --url "http://127.0.0.1:$1" >"$LOG/cloudflared-$1.log" 2>&1 &
}
tunnel_host() { # <metrics port>
  for _ in $(seq 60); do
    local h
    h=$(curl -s "http://127.0.0.1:$1/quicktunnel" | sed -n 's/.*"hostname":"\([^"]*\)".*/\1/p')
    [ -n "$h" ] && { echo "$h"; return 0; }
    sleep 0.5
  done
  return 1
}

echo "เปิด tunnel…"
tunnel 3001 20241
tunnel 3000 20240
SERVER_HOST=$(tunnel_host 20241) || { echo "tunnel ของ server ไม่ขึ้น ดู $LOG/cloudflared-3001.log"; exit 1; }
WEB_HOST=$(tunnel_host 20240) || { echo "tunnel ของ web ไม่ขึ้น ดู $LOG/cloudflared-3000.log"; exit 1; }

(cd apps/server && exec bun --watch src/index.ts) &
(cd apps/web && NEXT_PUBLIC_WS_URL="wss://$SERVER_HOST/ws" exec bun run dev) &

echo "รอ web compile…"
for _ in $(seq 120); do
  curl -s -o /dev/null http://127.0.0.1:3000/host && break
  sleep 1
done

cat <<EOF

  ┌──────────────────────────────────────────────────────────────
  │  จอใหญ่ เปิด:  https://$WEB_HOST/host
  │  WebSocket:    wss://$SERVER_HOST/ws
  │  log tunnel:   $LOG
  │  Ctrl+C เพื่อปิดทั้งหมด
  └──────────────────────────────────────────────────────────────

EOF
wait
