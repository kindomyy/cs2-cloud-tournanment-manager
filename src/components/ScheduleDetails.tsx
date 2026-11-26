import { useArena } from "../arena/ArenaContext";
import { useI18n } from "../i18n";
export function ScheduleDetails({ matchId }: { matchId: string }) {
  const { tx } = useI18n();
  const { snapshot } = useArena(),
    schedule = snapshot.config.schedule[matchId];
  if (!schedule || (!schedule.location && !schedule.notes)) return null;
  return (
    <dl className="schedule-details">
      {schedule.location && (
        <div>
          <dt>{tx("Yer", "Location")}</dt>
          <dd>{schedule.location}</dd>
        </div>
      )}
      {schedule.notes && (
        <div>
          <dt>{tx("Maç notu", "Match note")}</dt>
          <dd>{schedule.notes}</dd>
        </div>
      )}
    </dl>
  );
}
