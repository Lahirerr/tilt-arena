import type { GameMeta } from "../types";

export const tiltMeta: GameMeta = {
  id: "tilt-arena",
  title: "Tilt Arena",
  tagline: "เอียงมือถือกลิ้งลูกแก้ว ชนเพื่อนให้ตกวง",
  howTo: [
    { icon: "ta-icon-tilt", title: "เอียงมือถือ", text: "ลูกแก้วกลิ้งไปตามทางที่เอียง" },
    { icon: "ta-icon-dash", title: "กด DASH", text: "พุ่งชนแรงๆ แล้วรอชาร์จใหม่" },
    { icon: "ta-icon-out", title: "ดันคนอื่นตกวง", text: "คนสุดท้ายที่เหลือในวงชนะ" },
  ],
  minPlayers: 2,
  maxPlayers: 8,
  supportsBots: true,
  lateJoin: false,
  sensors: ["orientation"],
};
