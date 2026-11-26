import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { useArena } from "../arena/ArenaContext";
import { canJoinServer } from "../arena/permissions";
import { connectionAddress } from "../arena/schedule";
import { useI18n } from "../i18n";
export function ServerJoin({ address: participantAddress }: { address?: string } = {}) {
  const { tx } = useI18n();
  const arena = useArena();
  const [notice, setNotice] = useState("");
  let address = "";
  try {
    address = connectionAddress(participantAddress || (canJoinServer(arena.snapshot.config, arena.snapshot.me, arena.snapshot.runtimes) ? arena.snapshot.config.server?.address : ""));
  } catch {
    /* Hide invalid legacy addresses. */
  }
  if (!address) return null;
  return (
    <div className="server-join">
      <a className="button-text" href={`steam://connect/${address}`}>
        <ExternalLink size={14} /> {tx("Sunucuya katıl", "Join server")}
      </a>
      <button
        className="button-text"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(`connect ${address}`);
            setNotice(tx("Bağlantı komutu kopyalandı.", "Connect command copied."));
          } catch {
            setNotice(`${tx("CS2 konsolunda", "In CS2 console")}: connect ${address}`);
          }
        }}
      >
        <Copy size={14} /> {tx("Adresi kopyala", "Copy address")}
      </button>
      {notice && <span role="status">{notice}</span>}
    </div>
  );
}
export function InviteCopy({
  path,
  label,
}: {
  path: string;
  label?: string;
}) {
  const { tx } = useI18n();
  const [notice, setNotice] = useState("");
  const buttonLabel = label || tx("Oda davetini kopyala", "Copy room invite");
  return (
    <span className="invite-copy">
      <button
        className="button-text"
        onClick={async () => {
          const url = new URL(path, location.origin).href;
          try {
            await navigator.clipboard.writeText(url);
            setNotice(tx("Bağlantı kopyalandı.", "Link copied."));
          } catch {
            setNotice(url);
          }
        }}
      >
        <Copy size={14} />
        {buttonLabel}
      </button>
      {notice && <small role="status">{notice}</small>}
    </span>
  );
}
