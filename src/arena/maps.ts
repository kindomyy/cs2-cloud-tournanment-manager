import type { Match } from "../data";
import { mapNames } from "../tournament/engine";
export const mapImage = (name?: string) =>
  name && mapNames.includes(name)
    ? `/maps/${name.toLowerCase()}.png`
    : undefined;
export function currentMap(match: Match) {
  return (
    match.maps?.find((m) => m.status === "live")?.name ||
    match.map ||
    match.maps?.at(-1)?.name ||
    match.selectedMaps?.[0]
  );
}
