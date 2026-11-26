import { mapNames } from "../tournament/engine";
export const vetoPollInterval = 1200;
export type VetoAction = {
  map: string;
  kind: "ban" | "pick" | "decider";
  team: string;
  actor: string;
};
export type VetoState = {
  matchId: string;
  a: string;
  b: string;
  format: "BO1" | "BO3";
  revision: number;
  actions: VetoAction[];
  rehearsal: boolean;
  forced?: boolean;
  rosterKey: string;
};
export const sequence = (v: VetoState) =>
  v.format === "BO1"
    ? ["ban", "ban", "ban", "ban", "ban", "ban"]
    : ["ban", "ban", "pick", "pick", "ban", "ban"];
export const vetoDone = (v: VetoState) => v.actions.length === 7;
export const vetoTurn = (v: VetoState) =>
  v.actions.length % 2 === 0 ? v.a : v.b;
export const vetoMaps = (v: VetoState) =>
  v.actions.filter((a) => a.kind !== "ban").map((a) => a.map);
export function moveVeto(v: VetoState, map: string, actor: string): VetoState {
  if (
    vetoDone(v) ||
    !mapNames.includes(map) ||
    v.actions.some((a) => a.map === map)
  )
    throw new Error("Bu harita seçilemez.");
  const next = structuredClone(v);
  next.actions.push({
    map,
    kind: sequence(v)[v.actions.length] as "ban" | "pick",
    team: vetoTurn(v),
    actor,
  });
  if (next.actions.length === 6)
    next.actions.push({
      map: mapNames.find((m) => !next.actions.some((a) => a.map === m))!,
      kind: "decider",
      team: "",
      actor: "system",
    });
  next.revision++;
  return next;
}
