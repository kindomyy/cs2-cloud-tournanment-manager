export function connectionAddress(value: unknown) {
  if (value == null || value === "") return "";
  if (
    typeof value !== "string" ||
    value.length > 253 ||
    !/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?):[0-9]{1,5}$/.test(value) ||
    Number(value.split(":")[1]) < 1 ||
    Number(value.split(":")[1]) > 65535
  )
    throw new Error(
      "Sunucu adresi host:port biçiminde olmalı; ör. sunucu.example:27015.",
    );
  return value;
}
export function safeReturnPath(value: unknown) {
  return typeof value === "string" &&
    /^\/#(?:hesap|oyuncu|turnuva|sonuclar|1v1(?:\/duel-[a-f0-9-]{36})?|veto\/(?:U[1-7]|L[1-6]|GF2?))$/.test(
      value,
    )
    ? value
    : "/#oyuncu";
}
export const steamLoginURL = (path: string) =>
  `/api/auth/steam/start?returnTo=${encodeURIComponent(safeReturnPath(path))}`;
