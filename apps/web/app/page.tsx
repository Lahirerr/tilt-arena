"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROOM_CODE_LENGTH } from "@tilt/shared";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <main className="landing">
      <div className="landing-inner">
        <h1 className="logo">
          Tilt<span>Arena</span>
        </h1>
        <p className="tagline">เปิดจอใหญ่ 1 จอ ทุกคนสแกน QR แล้วเอียงมือถือชนเพื่อนให้ตกเวที</p>

        <div className="cards">
          <section className="card">
            <h2>📺 จอใหญ่</h2>
            <p>เปิดหน้านี้บน TV / โปรเจกเตอร์ / แล็ปท็อป</p>
            <Link className="btn-link" href="/host">
              สร้างห้อง
            </Link>
          </section>

          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === ROOM_CODE_LENGTH) router.push(`/play/${code}`);
            }}
          >
            <h2>📱 มือถือ</h2>
            <p>ใส่รหัสห้องที่เห็นบนจอใหญ่</p>
            <input
              className="code-input"
              value={code}
              maxLength={ROOM_CODE_LENGTH}
              placeholder="ABCD"
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
            />
            <button disabled={code.length !== ROOM_CODE_LENGTH}>เข้าร่วม</button>
          </form>
        </div>
      </div>
    </main>
  );
}
