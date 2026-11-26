import type { MapScore } from "../data";
import { mapNames } from "../tournament/engine";
import { Plus, X } from "lucide-react";
import { useI18n } from "../i18n";

export function MapEditor({
  maps,
  onChange,
}: {
  maps: MapScore[];
  onChange: (maps: MapScore[]) => void;
}) {
  const { tx } = useI18n();
  const change = (index: number, patch: Partial<MapScore>) =>
    onChange(maps.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  return (
    <div className="map-editor">
      <h3>{tx("Harita skorları", "Map scores")}</h3>
      {maps.map((map, i) => (
        <div className="map-editor-row" key={i}>
          <div className="map-editor-top">
            <label>
              {tx(`${i + 1}. harita`, `Map ${i + 1}`)}
              <select
                aria-label={tx(`Harita ${i + 1} adı`, `Map ${i + 1} name`)}
                value={map.name}
                onChange={(e) => change(i, { name: e.target.value })}
              >
                {mapNames.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              {tx("Durum", "Status")}
              <select
                aria-label={tx(`Harita ${i + 1} durumu`, `Map ${i + 1} status`)}
                value={map.status}
                onChange={(e) =>
                  change(i, { status: e.target.value as MapScore["status"] })
                }
              >
                <option value="live">{tx("Canlı", "Live")}</option>
                <option value="completed">{tx("Tamamlandı", "Completed")}</option>
              </select>
            </label>
            {maps.length > 1 && (
              <button
                type="button"
                aria-label={tx(`${i + 1}. haritayı kaldır`, `Remove map ${i + 1}`)}
                onClick={() => onChange(maps.filter((_, index) => index !== i))}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <div className="map-editor-scores">
            {map.score.map((n, side) => (
              <label key={side}>
                {side === 0
                  ? tx("Birinci takım", "First team")
                  : tx("İkinci takım", "Second team")}
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  required
                  aria-label={tx(
                    `Harita ${i + 1} ${side === 0 ? "birinci" : "ikinci"} takım raunt skoru`,
                    `Map ${i + 1} ${side === 0 ? "first" : "second"} team round score`,
                  )}
                  value={Number.isNaN(n) ? "" : n}
                  onChange={(e) =>
                    change(i, {
                      score:
                        side === 0
                          ? [
                              e.target.value === ""
                                ? NaN
                                : Number(e.target.value),
                              map.score[1],
                            ]
                          : [
                              map.score[0],
                              e.target.value === ""
                                ? NaN
                                : Number(e.target.value),
                            ],
                    })
                  }
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      {maps.length < 3 && (
        <button
          className="button-text"
          type="button"
          onClick={() =>
            onChange([
              ...maps,
              {
                name: mapNames.find(
                  (name) => !maps.some((m) => m.name === name),
                )!,
                status: "live",
                score: [0, 0],
              },
            ])
          }
        >
          <Plus size={14} /> {tx("Harita ekle", "Add map")}
        </button>
      )}
      <p className="editor-help">
        {tx(
          "Seri skoru tamamlanan haritalardan hesaplanır. Seri bittiyse oynanmayan üçüncü haritayı ekleme.",
          "Series score is calculated from completed maps. Do not add an unplayed third map if the series has already ended.",
        )}
      </p>
    </div>
  );
}
