import type { GameMeta } from "../types";

export const iceMeta: GameMeta = {
  id: "ice-run",
  title: "ส่งน้ำแข็ง",
  tagline: "มือถือคือถาด เดินไปส่งน้ำแข็งให้ลูกค้าโดยไม่หก",
  howTo: [
    { title: "ตักน้ำแข็ง", text: "ยืนที่ถังกลางร้าน น้ำแข็งจะลงถาดเอง" },
    { title: "เอียงเบาๆ", text: "เอียงแรงหรือหยุดกะทันหัน น้ำแข็งไถลตกถาด" },
    { title: "ส่งให้ลูกค้า + ป่วน", text: "เข้าวงโต๊ะที่มีลูกค้าเพื่อได้แต้ม เก็บไอเทม 🍌 💨 🫙 ไว้ป่วนคนอื่น" },
  ],
  minPlayers: 1,
  maxPlayers: 8,
  supportsBots: true,
  lateJoin: false,
  sensors: ["orientation"],
};
