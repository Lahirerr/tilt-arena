import type { GameMeta } from "../types";

export const ghostMeta: GameMeta = {
  id: "ghost-night",
  title: "คืนไล่ผี",
  tagline: "ช่วยกันทำพิธีไล่ผีก่อนไก่ขัน แต่มีเพื่อนคนหนึ่งโดนผีเข้า (demo)",
  howTo: [
    { title: "ถือเทียนเดินเบาๆ", text: "ขยับแรงเทียนดับ ไปจุดใหม่ที่ห้องพระ" },
    { title: "ทำพิธีให้ครบ", text: "จุดธูป 3 ดอก (ตั้งตรงนิ่ง) + สั่นกระดิ่งตามจังหวะ" },
    { title: "หาคนโดนผีเข้า", text: "ล้อมเขาครึ่งห้อง แล้วเขย่าพร้อมกัน 3 วิ" },
  ],
  minPlayers: 4,
  maxPlayers: 8,
  supportsBots: true, // demo only: so the rules can be tried with fewer people
  lateJoin: false,
  sensors: ["orientation", "motion"],
};
