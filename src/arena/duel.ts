import type { VetoState } from "./veto";
import type { LiveMatch } from "../tournament/liveTypes";
import type { Session } from "./model";

export type DuelPlayer = { name: string; steamId: string };
export type Duel = {
  id: string;
  externalId: string;
  revision: number;
  players: [DuelPlayer, DuelPlayer];
  ready: Record<string, number>;
  veto: VetoState | null;
  closed: boolean;
  createdAt: number;
};
export type DuelView = Duel & {
  live: LiveMatch | null;
  runtime?: import("./operations").MatchRuntime | null;
};
export type DuelFeed = {
  serverTime?: number;
  serverAddress?: string;
  me: Session;
  rooms: DuelView[];
  steamConfigured: boolean;
};
