import { useState } from "react";
import { Copy, Download, X } from "lucide-react";
import { mapNames } from "../tournament/engine";
import { botTrainingConfig } from "../arena/botTraining";
import { downloadBlob } from "../arena/download";
import { useI18n } from "../i18n";

export function BotTrainingPanel({
  initialMap,
  onClose,
}: {
  initialMap?: string;
  onClose: () => void;
}) {
  const { lang, tx } = useI18n();
  const [map, setMap] = useState(
      mapNames.includes(initialMap || "") ? initialMap! : "Inferno",
    ),
    [side, setSide] = useState("ct"),
    [difficulty, setDifficulty] = useState(2),
    [notice, setNotice] = useState("");
  const commands = botTrainingConfig(map, side, difficulty);
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(
        tx(
          "Kopyalandı. DatHost konsoluna yapıştırıp gönder.",
          "Copied. Paste into the DatHost console and send.",
        ),
      );
    } catch {
      setNotice(
        tx(
          "Otomatik kopyalanamadı. Komut kutusundaki metni seçip Ctrl+C ile kopyala.",
          "Could not copy automatically. Select the text in the command box and copy with Ctrl+C.",
        ),
      );
    }
  }
  function download() {
    downloadBlob(commands.config, "among-us-bot.cfg", "text/plain;charset=utf-8");
  }
  const difficultyLabels =
    lang === "en"
      ? ["Easy", "Normal", "Hard", "Expert"]
      : ["Kolay", "Normal", "Zor", "Uzman"];
  return (
    <div className="bot-training-panel">
      <div className="bot-panel-heading">
        <div>
          <span className="eyebrow">
            {tx("TEK OYUNCU + HAREKETLİ BOT", "SOLO PLAYER + MOVING BOT")}
          </span>
          <h2>{tx("Botla dene.", "Try with a bot.")}</h2>
        </div>
        <button
          className="icon-button"
          aria-label={tx("Bot antrenmanını kapat", "Close bot training")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p>
        {tx(
          "İkinci Steam hesabı ve maç JSON’u gerekmez. Buradan ayarları hazırlayıp DatHost konsolunda uygularsın. Bot antrenmanının skoru oyun içinde görünür; sitedeki gerçek 1v1 istatistiklerine yazılmaz.",
          "No second Steam account or match JSON required. Prepare the settings here and apply them in the DatHost console. Bot training scores appear in-game only and are not recorded in real 1v1 stats.",
        )}
      </p>
      <p className="setup-note">
        {tx(
          "Bu adımlar aynı sunucudaki yüklü maçı iptal eder. Sunucu boşken, yalnızca test için uygula.",
          "These steps cancel any match currently loaded on the same server. Use only for testing when the server is empty.",
        )}
      </p>
      <div className="admin-fields">
        <label>
          {tx("Bot antrenmanı haritası", "Bot training map")}
          <select value={map} onChange={(e) => setMap(e.target.value)}>
            {mapNames.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          {tx("Benim tarafım", "My side")}
          <select value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="ct">
              {tx("CT — bot T tarafında", "CT — bot on T side")}
            </option>
            <option value="t">
              {tx("T — bot CT tarafında", "T — bot on CT side")}
            </option>
          </select>
        </label>
        <label>
          {tx("Bot zorluğu", "Bot difficulty")}
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
          >
            {difficultyLabels.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ol className="bot-setup-steps">
        <li>
          <strong>
            {tx(
              "DatHost → Console bölümünü aç.",
              "Open DatHost → Console.",
            )}
          </strong>
          <p>
            {tx(
              `Haritayı değiştirmek istiyorsan bu komutu gönder. Harita tamamen yüklenip yeniden bağlandıktan sonra devam et. Zaten ${map} oynanıyorsa bu adımı geç.`,
              `Send this command if you want to switch maps. Continue after the map fully loads and you reconnect. Skip this step if ${map} is already loaded.`,
            )}
          </p>
          <code>{commands.mapCommand}</code>
          <button
            className="button-text"
            onClick={() => void copy(commands.mapCommand)}
          >
            <Copy size={14} />{" "}
            {tx("Harita komutunu kopyala", "Copy map command")}
          </button>
        </li>
        <li>
          <strong>
            {tx(
              "MatchZy maçını kapat ve bekleme moduna al.",
              "End the MatchZy match and put it in sleep mode.",
            )}
          </strong>
          <p>
            {lang === "en" ? (
              <>
                Send the three commands below one by one, waiting for each
                response. You should see MatchZy’s sleep/deactivated message at
                the end. Do not use <code>.prac</code> or <code>.bot</code>;
                those are for static bot practice mode.
              </>
            ) : (
              <>
                Aşağıdaki üç komutu sırayla, tek tek gönder. Her birinin
                çıktısını bekle. Sonunda MatchZy’nin sleep/deactivated mesajını
                görmelisin. <code>.prac</code> veya <code>.bot</code> kullanma;
                onlar farklı, sabit botlu antrenman içindir.
              </>
            )}
          </p>
          {commands.prepare.map((command) => (
            <div className="bot-command-row" key={command}>
              <code>{command}</code>
              <button
                className="button-text"
                onClick={() => void copy(command)}
                aria-label={tx(`${command} kopyala`, `Copy ${command}`)}
              >
                <Copy size={14} /> {tx("Kopyala", "Copy")}
              </button>
            </div>
          ))}
        </li>
        <li>
          <strong>
            {tx("Hareketli bot ayarlarını uygula.", "Apply moving bot settings.")}
          </strong>
          <p>
            {tx(
              `Oyunda ${side.toUpperCase()} takımına katıl. Aşağıdaki komutları konsola sırayla gönder; DatHost çok satırı kabul etmiyorsa satır satır uygula. Son komut raundu yeniden başlatır.`,
              `Join the ${side.toUpperCase()} team in-game. Send the commands below to the console in order; if DatHost rejects multiline input, send them line by line. The last command restarts the round.`,
            )}
          </p>
          <textarea
            className="bot-config-text"
            aria-label={tx(
              "Bot antrenmanı konsol komutları",
              "Bot training console commands",
            )}
            readOnly
            value={commands.config}
            rows={10}
          />
          <div className="duel-toolbar">
            <button
              className="button-primary"
              onClick={() => void copy(commands.config)}
            >
              <Copy size={15} />{" "}
              {tx("Bot ayarlarını kopyala", "Copy bot settings")}
            </button>
            <button className="button-text" onClick={download}>
              <Download size={15} /> {tx("CFG indir", "Download CFG")}
            </button>
          </div>
          <p>
            {lang === "en" ? (
              <>
                Alternative: upload the CFG file once to{" "}
                <code>game/csgo/cfg/among-us-bot.cfg</code> and run{" "}
                <code>exec among-us-bot.cfg</code> at this step.
              </>
            ) : (
              <>
                Alternatif: CFG dosyasını bir kez{" "}
                <code>game/csgo/cfg/among-us-bot.cfg</code> konumuna yükleyip bu
                adımda <code>exec among-us-bot.cfg</code> çalıştırabilirsin.
              </>
            )}
          </p>
        </li>
        <li>
          <strong>
            {tx("Gerçek 1v1’e geri dön.", "Return to real 1v1.")}
          </strong>
          <p>
            {lang === "en" ? (
              <>
                Send these two commands in order. Then use the real room’s URL
                match load command; both players type <code>.ready</code>.
              </>
            ) : (
              <>
                Bu iki komutu sırayla gönder. Ardından gerçek odanın URL’den maç
                yükleme komutunu kullan; iki oyuncu da <code>.ready</code>{" "}
                yazsın.
              </>
            )}
          </p>
          {commands.restore.map((command) => (
            <div className="bot-command-row" key={command}>
              <code>{command}</code>
              <button
                className="button-text"
                onClick={() => void copy(command)}
                aria-label={tx(
                  `Geri dönüş ${command} kopyala`,
                  `Copy restore command ${command}`,
                )}
              >
                <Copy size={14} /> {tx("Kopyala", "Copy")}
              </button>
            </div>
          ))}
        </li>
      </ol>
      {notice && (
        <p className="save-notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
