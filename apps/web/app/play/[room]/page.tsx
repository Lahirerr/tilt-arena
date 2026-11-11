"use client";

import { useParams } from "next/navigation";
import HubController from "@/hub/HubController";

/** a phone in the room: join once, then play whatever game the host runs */
export default function PlayPage() {
  const { room } = useParams<{ room: string }>();
  return <HubController code={String(room ?? "").toUpperCase()} />;
}
