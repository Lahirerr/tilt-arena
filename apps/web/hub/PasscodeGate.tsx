"use client";

import { useState, type FormEvent } from "react";
import type { GameMeta } from "@/games/types";

/**
 * Games with `meta.passcode` are for admin testing: picking one asks for the code first.
 * Client-side only (the code ships in the bundle) — it keeps players out, not a determined admin.
 * Usage: const { askCode, gate } = usePasscodeGate(); onClick={() => askCode(meta, go)}; render {gate}
 */
export function usePasscodeGate() {
  const [pending, setPending] = useState<{ meta: GameMeta; go: () => void } | null>(null);
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);

  const askCode = (meta: GameMeta, go: () => void) => {
    if (!meta.passcode) return go();
    setValue("");
    setWrong(false);
    setPending({ meta, go });
  };

  const close = () => setPending(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    if (value.trim() === pending.meta.passcode) {
      pending.go();
      close();
    } else {
      setWrong(true);
      setValue("");
      navigator.vibrate?.(120);
    }
  };

  const gate = pending && (
    <div className="pass-gate" role="dialog" aria-modal="true" aria-labelledby="pass-gate-title" onClick={close}>
      <form className="pass-card" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <div className="pass-lock">🔒</div>
        <b id="pass-gate-title">{pending.meta.title}</b>
        <p>สำหรับแอดมินทดสอบ ต้องใส่รหัส</p>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="off"
          maxLength={12}
          placeholder="รหัส"
          aria-label="รหัสแอดมิน"
          aria-invalid={wrong}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setWrong(false);
          }}
          className={wrong ? "wrong" : ""}
        />
        <p className="pass-err" aria-live="polite">{wrong ? "รหัสไม่ถูกต้อง" : ""}</p>
        <div className="pass-row">
          <button type="button" onClick={close}>ยกเลิก</button>
          <button type="submit" className="pass-ok">ตกลง</button>
        </div>
      </form>
    </div>
  );

  return { askCode, gate };
}
