import type { ComponentType } from "react";
import type { GameId, PlayerInfo } from "@tilt/shared";
import type { SoundName } from "@/lib/sfx";

/** one step on the intro screen; icon is a file in /public/ui (DDJoinJoy tutorial icon) */
export interface HowToStep {
  title: string;
  text: string;
  icon?: string;
}

export interface GameMeta {
  id: GameId;
  title: string; // "Tilt Arena"
  tagline: string; // one line on the game card
  howTo: HowToStep[]; // 3 steps for the intro screen
  minPlayers: number;
  maxPlayers: number;
  supportsBots: boolean;
  lateJoin: boolean; // can someone join mid-game?
  sensors: ("orientation" | "motion")[];
}

export interface GameContext {
  /** everyone in this game (bots included when the game supportsBots) */
  players: PlayerInfo[];
  /** to one phone; silently skipped for bots */
  send(id: string, d: unknown): void;
  /** to every phone */
  broadcast(d: unknown): void;
  /** sound on the big screen */
  playSound(name: SoundName, strength?: number): void;
  /** tell the hub the game is over */
  end(result: GameResult): void;
}

export interface GameResult {
  ranking: string[][]; // [[1st], [2nd tied, 2nd tied], ...] player ids
  headline: string; // "Petch ชนะ!"
}

export interface HostGame {
  start(ctx: GameContext): void;
  join(p: PlayerInfo): void; // only called mid-game when meta.lateJoin
  leave(id: string): void;
  input(id: string, d: unknown): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, w: number, h: number, now: number): void;
  dispose(): void;
  /** optional: dims this player on the host scoreboard */
  isOut?(id: string): boolean;
}

/** phone side */
export type ControllerProps = {
  me: PlayerInfo;
  send(d: unknown): void;
  /** game messages from the big screen; returns unsubscribe */
  subscribe(fn: (d: unknown) => void): () => void;
};

export interface GameEntry {
  meta: GameMeta;
  createHost(): HostGame;
  Controller: ComponentType<ControllerProps>;
}

export const isBot = (id: string) => id.startsWith("bot-");
