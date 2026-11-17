import type { GameId } from "@tilt/shared";
import type { GameEntry } from "@/games/types";
import { tiltMeta } from "@/games/tilt-arena/meta";
import { TiltArena } from "@/games/tilt-arena/host";
import TiltController from "@/games/tilt-arena/Controller";
import { ghostMeta } from "@/games/ghost-night/meta";
import { GhostNight } from "@/games/ghost-night/host";
import GhostController from "@/games/ghost-night/Controller";
import { iceMeta } from "@/games/ice-run/meta";
import { IceRun } from "@/games/ice-run/host";
import IceController from "@/games/ice-run/Controller";

/** every game in the hub. A new game = a folder in games/ + one line here (and its id in @tilt/shared). */
export const GAMES = {
  "tilt-arena": { meta: tiltMeta, createHost: () => new TiltArena(), Controller: TiltController },
  "ghost-night": { meta: ghostMeta, createHost: () => new GhostNight(), Controller: GhostController },
  "ice-run": { meta: iceMeta, createHost: () => new IceRun(), Controller: IceController },
} satisfies Record<GameId, GameEntry>;

export const GAME_LIST = Object.values(GAMES);
