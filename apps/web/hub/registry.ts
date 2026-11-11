import type { GameId } from "@tilt/shared";
import type { GameEntry } from "@/games/types";
import { tiltMeta } from "@/games/tilt-arena/meta";
import { TiltArena } from "@/games/tilt-arena/host";
import TiltController from "@/games/tilt-arena/Controller";

/** every game in the hub. A new game = a folder in games/ + one line here (and its id in @tilt/shared). */
export const GAMES = {
  "tilt-arena": { meta: tiltMeta, createHost: () => new TiltArena(), Controller: TiltController },
} satisfies Record<GameId, GameEntry>;

export const GAME_LIST = Object.values(GAMES);
