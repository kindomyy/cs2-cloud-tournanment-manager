import { useArena } from "../arena/ArenaContext";
import { activePresentationMatch } from "../arena/presentation";
import { useTournament } from "../tournament/TournamentContext";
import type { Match } from "../data";
import { FeaturedMatch } from "./Home";
import { Bracket } from "./TournamentBracket";
import { useI18n } from "../i18n";

export function MinimalTournament({ onSelect }: { onSelect: (match: Match) => void }) {
  const { tx } = useI18n();
  const { snapshot } = useArena();
  const { matches } = useTournament();
  const active = activePresentationMatch(snapshot.config, matches, snapshot.runtimes);
  return (
    <div className="minimal-tournament" aria-label={tx("Minimal turnuva görünümü", "Minimal tournament view")}>
      {active && <section className="minimal-current-match" aria-label={tx("Aktif maç", "Active match")}>
        <FeaturedMatch match={active} onSelect={onSelect} />
      </section>}
      <Bracket onSelect={onSelect} />
    </div>
  );
}
