import type { ManagedTeam } from "./model";
import type { Match } from "../data";
import { vetoDone, type VetoState } from "./veto";
export type Phase =
  | "preparing"
  | "veto"
  | "veto-complete"
  | "loading"
  | "warmup"
  | "live"
  | "paused"
  | "restoring"
  | "completed"
  | "cancelled"
  | "review";
export type MatchRuntime = {
  matchId: string;
  externalId: string;
  phase: Phase;
  teams?: [ManagedTeam, ManagedTeam];
  /** Browser projection: verification belongs to this frozen lineup. */
  verifiedPlayerIds?: string[];
  lastEvent?: string;
  lastEventAt?: string;
  mapNumber?: number;
  restoreRound?: number;
  restorePending?: boolean;
  barrierAt?: string;
  lastBackupKey?: string;
  strictRounds?: boolean;
};
export const phaseLabels: Record<Phase, string> = {
  preparing: "Oyuncular hazırlanıyor",
  veto: "Veto sürüyor",
  "veto-complete": "Haritalar hazır",
  loading: "Sunucu onayı bekleniyor",
  warmup: "Oyun içi hazırlık",
  live: "Canlı maç",
  paused: "Maç duraklatıldı",
  restoring: "Backup sonrası veri bekleniyor",
  completed: "Sonuçlandı",
  cancelled: "Maç iptal edildi",
  review: "Sonuç onayı bekleniyor",
};
export type AuditEntry = {
  id: string;
  at: number;
  actor: string;
  action: string;
  match_id: string | null;
  detail: Record<string, unknown>;
};

export function matchPhase(
  match: Pick<Match, "status">,
  runtime?: MatchRuntime,
  veto?: VetoState,
): Phase {
  if (match.status === "completed") return "completed";
  if (runtime && !["preparing", "veto", "veto-complete"].includes(runtime.phase))
    return runtime.phase;
  if (match.status === "live") return "live";
  if (veto) return vetoDone(veto) ? "veto-complete" : "veto";
  return "preparing";
}
