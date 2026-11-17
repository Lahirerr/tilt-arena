import type { Metadata, Viewport } from "next";
import { Sriracha } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tilt Arena",
  description: "Big-screen party game. Your phone is the controller.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#252b28",
};

/** used by ส่งน้ำแข็ง (canvas + phone), exposed as --font-sriracha */
const sriracha = Sriracha({ weight: "400", subsets: ["latin", "thai"], variable: "--font-sriracha", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={sriracha.variable}>
      <body>{children}</body>
    </html>
  );
}
