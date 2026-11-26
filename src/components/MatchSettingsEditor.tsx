import type { ArenaConfig } from "../arena/model";
import { useI18n } from "../i18n";

export function MatchSettingsEditor({ value, onChange }: {
  value: ArenaConfig["schedule"][string];
  onChange: (next: ArenaConfig["schedule"][string]) => void;
}) {
  const { tx } = useI18n();
  return <div className="schedule-editor"><div className="admin-fields">
    <label>{tx("Yer / sunucu etiketi", "Venue / server label")}<input maxLength={100} value={value.location || ""} onChange={e => onChange({ ...value, location: e.target.value })} /></label>
    <label>{tx("Oyunculara maç notu", "Match note for players")}<textarea maxLength={500} rows={2} value={value.notes || ""} onChange={e => onChange({ ...value, notes: e.target.value })} /></label>
  </div></div>;
}
