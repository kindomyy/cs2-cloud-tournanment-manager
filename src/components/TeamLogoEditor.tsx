import { useId, useState } from "react";
import { useI18n } from "../i18n";

async function prepareLogo(file: File, tx: (tr: string, en: string) => string) {
  if (
    !/^image\/(png|jpeg|webp)$/.test(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error(
      tx(
        "5 MB’a kadar PNG, JPEG veya WebP seç.",
        "Choose a PNG, JPEG, or WebP up to 5 MB.",
      ),
    );
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        tx("Tarayıcı logoyu işleyemedi.", "The browser could not process the logo."),
      );
    const scale = Math.min(256 / bitmap.width, 256 / bitmap.height);
    const w = bitmap.width * scale,
      h = bitmap.height * scale;
    context.drawImage(bitmap, (256 - w) / 2, (256 - h) / 2, w, h);
    for (const quality of [0.9, 0.75, 0.55]) {
      const value = canvas.toDataURL("image/webp", quality);
      if (value.length < 87000) return value;
    }
    throw new Error(
      tx(
        "Logo küçültülemedi. Daha sade bir görsel seç.",
        "Logo could not be compressed. Choose a simpler image.",
      ),
    );
  } finally {
    bitmap.close();
  }
}

export function TeamLogoEditor({
  logo,
  onChange,
}: {
  logo?: string | null;
  onChange: (logo: string | null) => void;
}) {
  const { tx } = useI18n();
  const id = useId();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="team-logo-editor">
      <div className="logo-preview">
        {logo ? (
          <img
            src={logo}
            alt={tx("Takım logosu önizlemesi", "Team logo preview")}
          />
        ) : (
          <span>LOGO</span>
        )}
      </div>
      <div>
        <label htmlFor={id}>{tx("Takım logosu", "Team logo")}</label>
        <input
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              onChange(await prepareLogo(file, tx));
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
        <small>
          {busy
            ? tx("Logo hazırlanıyor…", "Preparing logo…")
            : tx(
                "PNG, JPEG veya WebP · en fazla 5 MB · otomatik küçültülür",
                "PNG, JPEG, or WebP · up to 5 MB · auto-resized",
              )}
        </small>
        {logo && (
          <button
            type="button"
            className="button-text"
            onClick={() => onChange(null)}
          >
            {tx("Logoyu kaldır", "Remove logo")}
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
