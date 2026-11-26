import { useI18n, type Lang } from "../i18n";

export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div
      className="lang-toggle"
      role="group"
      aria-label={lang === "en" ? "Language" : "Dil seçimi"}
    >
      {(["tr", "en"] as Lang[]).map((code) => (
        <button
          key={code}
          type="button"
          className={lang === code ? "active" : ""}
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
