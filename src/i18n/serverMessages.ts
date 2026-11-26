export type Lang = "tr" | "en";

export function parseAcceptLanguage(header: string | null | undefined): Lang {
  if (!header) return "tr";
  const entries = header
    .split(",")
    .map((part, index) => {
      const [rawTag, ...params] = part.trim().split(";");
      const tag = (rawTag || "").trim().toLowerCase();
      let q = 1;
      for (const param of params) {
        const match = /^q\s*=\s*([0-9.]+)$/i.exec(param.trim());
        if (match) {
          const parsed = Number(match[1]);
          if (Number.isFinite(parsed)) q = parsed;
        }
      }
      return { tag, q, index };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of entries) {
    if (tag === "en" || tag.startsWith("en-")) return "en";
    if (tag === "tr" || tag.startsWith("tr-")) return "tr";
  }
  return "tr";
}

const exactEn: Record<string, string> = {
  // HTTP & generic API
  "POST gerekli.": "POST is required.",
  "GET gerekli.": "GET is required.",
  "GET veya POST gerekli.": "GET or POST is required.",
  "JSON gerekli.": "JSON is required.",
  "Boş istek.": "Empty request.",
  "Geçersiz JSON.": "Invalid JSON.",
  "İstek çok büyük.": "Request is too large.",
  "İstek fazla büyük.": "Request is too large.",
  "Yöntem desteklenmiyor.": "Method not allowed.",
  "API adresi bulunamadı.": "API endpoint not found.",
  "İşlem bulunamadı.": "Action not found.",
  "İşlem tamamlanamadı.": "Action could not be completed.",
  "İşlem uygulanamadı.": "Operation could not be applied.",
  "Yetkisiz istek.": "Unauthorized request.",
  "Geçersiz kaynak.": "Invalid origin.",
  "Önce giriş yap.": "Sign in first.",
  "Yönetici girişi gerekli.": "Admin sign-in is required.",
  "Yönetici yetkisi gerekli.": "Admin permission is required.",
  "Bu işlem yalnızca site yöneticisine açıktır.": "This action is restricted to the site admin.",
  "Sunucu yanıtı alınamadı.": "Could not get a server response.",
  "Sunucu yanıtı okunamadı.": "Could not read the server response.",
  "Sunucu yanıtı okunamadı. Bağlantıyı ve SQL kurulumunu kontrol et.":
    "Could not read the server response. Check the connection and SQL setup.",
  "D1 bağlantısı yok.": "No D1 database binding.",
  "D1 bağlantısı gerekli.": "D1 database connection is required.",
  "D1 ve yönetim şeması kurulmalı.": "D1 and the management schema must be configured.",
  "Turnuva kaydı başlatılamadı.": "Could not initialize the tournament record.",
  "Giriş sistemi hazır değil. D1 yönetim şemasını kontrol et.":
    "Authentication system is not ready. Check the D1 management schema.",
  "Yönetim veritabanı hazır değil. 0002 ve 0004 migration dosyalarını kontrol et.":
    "Management database is not ready. Check migration files 0002 and 0004.",
  "Operasyon veritabanı hazır değil. 0004_operations.sql dosyasını bağlı D1 üzerinde çalıştır.":
    "Operations database is not ready. Apply 0004_operations.sql on the bound D1 database.",
  "1v1 veritabanı hazır değil. 0003_private_duels.sql dosyasını bağlı D1 veritabanında çalıştır.":
    "1v1 database is not ready. Apply 0003_private_duels.sql on the bound D1 database.",
  "1v1 maç dosyası hazırlanamadı. D1 bağlantısını ve 0003 migration dosyasını kontrol et.":
    "Could not prepare the 1v1 match file. Check the D1 connection and migration 0003.",
  "1v1 işlemi tamamlanamadı.": "1v1 action could not be completed.",
  "Maç dosyası hazırlanamadı.": "Could not prepare the match config.",
  "Maç bağlantısı kullanılamıyor.": "Match link is unavailable.",
  "Canlı veriler şu anda alınamıyor.": "Live data is currently unavailable.",
  "Veri kaydı kullanılamıyor.": "Data storage is unavailable.",
  "Sunucu bağlantısı henüz yapılandırılmadı.": "Server integration is not configured yet.",
  "Olay veya maç eşleştirmesi geçersiz.": "Event or match binding is invalid.",

  // Auth & Steam
  "ADMIN_PASSWORD en az 12 karakterle ayarlanmalı.": "ADMIN_PASSWORD must be set to at least 12 characters.",
  "Çok fazla deneme. 10 dakika sonra tekrar dene.": "Too many attempts. Try again in 10 minutes.",
  "Yönetici parolası yanlış.": "Incorrect admin password.",
  "Kendi Steam hesabınla giriş yap.": "Sign in with your own Steam account.",
  "Steam profil bilgisi alınamadı. Girişin ve takım kaydın korunuyor; daha sonra yeniden dene.":
    "Could not fetch Steam profile info. Your sign-in and team registration are preserved; try again later.",
  "PUBLIC_ORIGIN sitenin HTTPS adresi olarak ayarlanmalı.": "PUBLIC_ORIGIN must be set to the site's HTTPS origin.",
  "Steam doğrulaması başarısız. Girişi Steam üzerinden yeniden başlat.":
    "Steam verification failed. Restart sign-in through Steam.",
  "Steam yanıt vermedi. Tekrar giriş yap.": "Steam did not respond. Please sign in again.",
  "SteamID64 geçersiz.": "Invalid SteamID64.",
  "Doğrulanmış Steam kaydı bulunamadı.": "Verified Steam record not found.",
  "Steam profil adı yenilenemedi. Kayıtlı ad kullanılmaya devam edecek.":
    "Could not refresh Steam profile name. The saved name will continue to be used.",
  "Steam doğrulaması gerekli.": "Steam verification is required.",
  "Önce Steam veya yönetici girişi yap.": "Sign in with Steam or as admin first.",

  // Management, Teams, Veto & Readiness
  "Başka bir değişiklik var. Sayfayı yenile.": "Another change was saved. Reload the page.",
  "Turnuva başka bir ekranda güncellendi. Yenile ve tekrar dene.":
    "The tournament was updated on another screen. Refresh and try again.",
  "Turnuva güncellendi. Son durumu yükle.": "Tournament updated. Load the latest state.",
  "Sayfayı yenile; turnuva güncellendi.": "Refresh the page; the tournament was updated.",
  "Sayfayı yenile.": "Refresh the page.",
  "Takım bulunamadı.": "Team not found.",
  "Yalnızca kendi takımının kaptanı bu bilgileri değiştirebilir.":
    "Only your own team's captain can edit this information.",
  "Takım güncellendi. Sayfayı yenile ve tekrar dene.":
    "Team was updated. Refresh the page and try again.",
  "İlk tur eşleşmeleri veya takım listesi değişiyor. Devam edersen tüm turnuvanın sonuçları, hazır durumları ve vetoları sıfırlanacak; maç kimlikleri yenilenecek. Takımlar, oyuncular ve takvim korunur. Sunucudaki maç otomatik durdurulmaz. Sıfırlayarak kaydetmeyi onayla.":
    "Opening matchups or the team list are changing. Continuing will reset all tournament results, ready states, and vetoes, and rotate match IDs. Teams, players, and schedule are preserved. Any live server match is not stopped automatically. Confirm saving with reset.",
  "İlk tur eşleşmeleri veya takım listesi değişiyor. Tüm turnuvanın sonuçları, hazır durumları ve vetoları sıfırlanacak. Takımlar, oyuncular ve takvim korunur. Sıfırlayarak kaydetmeyi onayla.":
    "Opening matchups or the team list are changing. All tournament results, ready states, and vetoes will be reset. Teams, players, and schedule are preserved. Confirm saving with reset.",
  "Maç bulunamadı.": "Match not found.",
  "İki takımı belli olan bir maç seç.": "Select a match with both teams decided.",
  "Veto için iki takım ve henüz başlamamış bir maç gerekli.":
    "Veto requires both teams and an unstarted match.",
  "Bu işlem için iki takım da beşer oyunculu olmalı.":
    "Both teams must have 5 players for this action.",
  "Sunucuya yüklenen maçı önce sunucu kontrolünden iptal et.":
    "Cancel the loaded server match from server controls first.",
  "Yalnızca bu maçın Steam ile giriş yapan oyuncusu kendi hazır durumunu değiştirebilir.":
    "Only a Steam-authenticated player in this match can change their own ready status.",
  "Veto başladı; hazır durumu kilitlendi.": "Veto has started; ready status is locked.",
  "Bu kadro için Steam ile doğrulanmış oyuncu girişi gerekli.":
    "A Steam-verified player session for this roster is required.",
  "Bu maçın vetosu zaten var. Yeniden başlatmak için önce vetoyu sıfırla.":
    "This match already has a veto. Reset the veto first to restart it.",
  "Zorla veto için iki takımda eşit sayıda, 1–5 oyuncu olmalı.":
    "Force veto requires both teams to have an equal roster of 1–5 players.",
  "Zorla veto için kadrodaki her oyuncunun SteamID64 kaydı gerekli.":
    "Force veto requires every player on both rosters to have a SteamID64.",
  "Hazır kontrolünü atlayarak gerçek vetoyu başlatmayı onayla.":
    "Confirm bypassing the ready check to start a real veto.",
  "Bu işlem yalnızca yönetici ve prova modunda kullanılabilir.":
    "This action is only available to admins in rehearsal mode.",
  "Aktif veto yok.": "No active veto.",
  "Prova vetosunu yalnızca yönetici kullanabilir.": "Only admins can operate a rehearsal veto.",
  "Veto başka bir ekranda güncellendi.": "Veto was updated on another screen.",
  "Haritayı yalnızca sırası gelen takımın kaptanı seçebilir.":
    "Only the captain of the team whose turn it is can pick or ban a map.",
  "Bu hamle zaten uygulandı. Sayfa güncelleniyor.": "This move was already applied. Refreshing page.",
  "Bu harita seçilemez.": "This map cannot be selected.",
  "Veto bulunamadı.": "Veto not found.",
  "Gerçek maç dosyası için doğrulanmış kadrolarla veto tamamlanmalı. Prova dosyası sunucuya verilmez.":
    "A real match config requires a completed veto with verified rosters. Rehearsal configs are not issued for servers.",
  "MatchZy maç ID’si 1–2147483647 aralığında olmalı. Admin panelinden yeni maç ID’si oluştur.":
    "MatchZy match ID must be between 1 and 2147483647. Generate a new match ID from the admin panel.",
  "Maç dosyası için eşit kadrolar ve her oyuncunun SteamID64 kaydı gerekli.":
    "Match config requires equal rosters and a SteamID64 for every player.",

  // Duels (1v1)
  "1v1 için çevrimiçi D1 bağlantısı gerekli.": "Online D1 database connection is required for 1v1.",
  "Oda bulunamadı veya bu odanın oyuncusu değilsin.": "Room not found or you are not a player in this room.",
  "Odayı yönetici açabilir.": "Only an admin can create a room.",
  "İki oyuncu gerekli.": "Two players are required.",
  "İki geçerli SteamID64 gir.": "Enter two valid SteamID64 values.",
  "Oyuncuların SteamID64 bilgileri farklı olmalı.": "Both players must have different SteamID64 values.",
  "Önce eski 1v1 odalarını kapat. En fazla 20 açık oda olabilir.":
    "Close old 1v1 rooms first. At most 20 open rooms are allowed.",
  "Oda bulunamadı.": "Room not found.",
  "Oda kapalı. Yeni bir 1v1 odası aç.": "Room is closed. Open a new 1v1 room.",
  "Oda başka bir ekranda güncellendi. Son durumu yükle ve tekrar dene.":
    "Room was updated on another screen. Load the latest state and try again.",
  "Önce bu odanın Sunucudaki maçı bitir kontrolünü kullan. Sunucu durduktan sonra odayı kapat.":
    "Use 'End server match' for this room first. Close the room after the server stops.",
  "Veto başladı; hazırlık kilitlendi.": "Veto has started; readiness is locked.",
  "Hazır kontrolünü atlamayı onayla.": "Confirm bypassing the ready check.",
  "Bu odadaki oyuncunun Steam girişi gerekli.": "Steam sign-in by a player in this room is required.",
  "Sıra diğer oyuncuda.": "It is the other player's turn.",
  "Oda güncellendi. Tekrar dene.": "Room was updated. Try again.",
  "Açık odada veto tamamlanmalı.": "Veto must be completed in an open room.",

  // DatHost & Operations
  "DatHost sunucusu": "DatHost server",
  "DatHost için DATHOST_EMAIL, DATHOST_PASSWORD ve sunucu ID’si gerekli.":
    "DATHOST_EMAIL, DATHOST_PASSWORD, and server ID are required for DatHost.",
  "DatHost erişim ayarları eksik.": "DatHost access settings are incomplete.",
  "DatHost bağlantısı test edilemedi.": "DatHost connection could not be tested.",
  "DatHost sunucu bilgisi okunamadı. API geçerli JSON döndürmedi; oyun komutu gönderilmedi.":
    "Could not read DatHost server info. API did not return valid JSON; no game command was sent.",
  "DatHost yanıtı seçili sunucunun bilgisini doğrulamadı. Sunucu ID’sini ve API erişimini kontrol et; oyun komutu gönderilmedi.":
    "DatHost response did not verify the selected server. Check the server ID and API access; no game command was sent.",
  "DatHost bağlantısı 15 saniye içinde yanıt vermedi. Bu test yalnızca sunucu bilgisini okur; oyun komutu gönderilmedi. Cloudflare’dan dış erişimi ve DatHost hizmet durumunu kontrol et.":
    "DatHost did not respond within 15 seconds. This test only reads server info; no game command was sent. Check outbound access from Cloudflare and DatHost service status.",
  "DatHost’a ağ bağlantısı kurulamadı. Bu test yalnızca sunucu bilgisini okur; oyun komutu gönderilmedi. Cloudflare’dan dış erişimi ve DatHost hizmet durumunu kontrol et.":
    "Could not establish a network connection to DatHost. This test only reads server info; no game command was sent. Check outbound access from Cloudflare and DatHost service status.",
  "DatHost bağlantısı 15 saniye içinde yanıt vermedi. Komutun sonucu belirsiz olabilir; tekrar göndermeden önce DatHost konsolundan sunucu durumunu kontrol et.":
    "DatHost did not respond within 15 seconds. The command outcome may be uncertain; check the server status in the DatHost console before retrying.",
  "DatHost’a ağ bağlantısı kurulamadı. Komutun sonucu belirsiz olabilir; tekrar göndermeden önce DatHost konsolundan sunucu durumunu kontrol et.":
    "Could not establish a network connection to DatHost. The command outcome may be uncertain; check the server status in the DatHost console before retrying.",
  "Sunucu işlemi geçersiz.": "Invalid server action.",
  "Sunucu işlemini onayla.": "Confirm the server action.",
  "DatHost erişimi eksik. Sunucu ID’sini ve Cloudflare Secrets ayarlarını tamamla.":
    "DatHost access is incomplete. Configure the server ID and Cloudflare Secrets.",
  "Sunucuda bir işlem sürüyor. Sonucu bekle.": "A server operation is in progress. Wait for the result.",
  "Bu maç için yükleme zaten gönderildi. MatchZy onayı bekleniyor veya maç sunucuda aktif.":
    "Load command was already sent for this match. Waiting for MatchZy confirmation or match is already active.",
  "Sunucuda başka bir maç var. Doğru maçı seç.": "Another match is on the server. Select the right match.",
  "Bu maçın sunucuya yüklendiği doğrulanmadı.": "This match has not been confirmed as loaded on the server.",
  "Backup raundu 0–100 arasında olmalı.": "Backup round must be between 0 and 100.",
  "Bu oda daha önce sunucuda oynandı. Tekrar için yeni bir 1v1 odası aç.":
    "This room was already played on the server. Open a new 1v1 room to play again.",
  "Bu deneme sunucuda kullanıldı. Önce 'Yeni kimlikle tekrar oynat' ile yeni deneme aç.":
    "This attempt was already used on the server. Use 'Replay with new ID' first.",
  "Sunucuya yüklemek için PUBLIC_ORIGIN gerçek HTTPS site adresi olmalı.":
    "PUBLIC_ORIGIN must be the real HTTPS site origin to load a match on the server.",
  "Webhook Secret en az 24 karakter olmalı; boşluk, tırnak, noktalı virgül veya ters eğik çizgi içeremez.":
    "Webhook Secret must be at least 24 characters and cannot contain spaces, quotes, semicolons, or backslashes.",
  "Başka bir sunucu işlemi veya aktif maç var.": "Another server operation or active match is already in progress.",
  "Komut DatHost’a iletildi. MatchZy olayıyla sunucu onayı beklenecek.":
    "Command sent to DatHost. Waiting for MatchZy event confirmation.",
  "DatHost işlemi tamamlanamadı.": "DatHost operation could not be completed.",
  "Geçersiz veya süresi dolmuş maç bağlantısı.": "Invalid or expired match link.",
  "Sunucudaki maçı DatHost üzerinden bitirdikten sonra boş durumunu onayla. Bu işlem yalnızca sitedeki bekleyen sunucu kaydını temizler.":
    "Confirm the server is idle only after ending the match on DatHost. This only clears the pending server lock on the site.",
  "Maç ayarları güncellendi. Son durumu yükle ve komutu yeniden gözden geçir.":
    "Match settings were updated. Load the latest state and review the command again.",
  "Seçili maç için sunucu komutu gönderilecek. Yükleme haritayı değiştirebilir; iptal maçı bitirir. Uygulamayı onayla.":
    "A server command will be sent for the selected match. Loading may change the map; ending terminates the match. Confirm to proceed.",
  "Mevcut kayıtlar yedekteki kayıtlarla değişecek. Önce sunucudaki maçı durdurduğunu ve geri yüklemeyi onayla.":
    "Current records will be replaced with the backup. Confirm that you stopped the live server match and want to restore.",
  "Kazananı ve en fazla 300 karakterlik hükmen karar nedenini gir.":
    "Select the winner and enter a forfeit reason up to 300 characters.",
  "Önce sunucudaki maçı durdurduğunu onayla.": "Confirm that you stopped the match on the server first.",
  "Harita ve geri yüklenen raund geçersiz.": "Invalid map or restored round.",
  "Sunucuya yüklenmiş veya oynanmış maçta kadro yenilenmez. Önce maçı durdurup yeni deneme aç.":
    "Lineup cannot be refreshed on a loaded or played match. Stop the match and start a replay first.",
  "Yalnızca seçili maçın hazır durumları ve vetosu temizlenecek; güncel takım kadrosu kullanılacak.":
    "Only ready states and veto for the selected match will be cleared; the current team roster will be used.",

  // Backups
  "Yedekte veto verisi geçersiz.": "Invalid veto data in backup.",
  "Veto oyuncusu geçersiz.": "Invalid veto actor.",
  "Veto sırası veya kalan harita geçersiz.": "Invalid veto sequence or decider map.",
  "Bu dosya geçerli bir tam turnuva yedeği değil. Yönetim taslağı veya kişisel deneme dosyası kullanılamaz.":
    "This file is not a valid full tournament backup. Management drafts or personal trial files cannot be used.",
  "Yedekte harita kaydı geçersiz/tekrarlı.": "Invalid or duplicate map record in backup.",
  "Harita metadatası yedekle uyuşmuyor.": "Map metadata does not match backup.",
  "Turnuva vetosu geçersiz.": "Invalid tournament veto.",
  "Maç aşaması yedekte geçersiz.": "Invalid match phase in backup.",
  "Kilitli kadro iki takım içermeli.": "Frozen lineup must contain two teams.",
  "1v1 yedeği geçersiz.": "Invalid 1v1 backup data.",
  "1v1 oyuncusu geçersiz.": "Invalid 1v1 player in backup.",
  "1v1 vetosu odayla uyuşmuyor.": "1v1 veto does not match room.",
  "1v1 ve turnuva maç kimlikleri çakışıyor.": "1v1 and tournament match IDs conflict.",
  "Geri yükleme atomik D1 batch desteği gerektirir.": "Restore requires atomic D1 batch support.",
  "Otomatik güvenlik yedeği çok büyük. Önce mevcut yedeği indir ve eski test odalarını düzenle.":
    "Automatic safety backup is too large. Download the current backup first and clean up old test rooms.",
  "Yedek bulunamadı.": "Backup not found.",

  // MatchZy & Events
  "Maç kimliği geçersiz.": "Invalid match ID.",
  "Maç eşleştirmesi bulunamadı.": "Match binding not found.",
  "Harita sırası geçersiz.": "Invalid map index.",
  "Backup raundu geçersiz.": "Invalid backup round.",
  "Maç eşleştirmeleri hazır değil.": "Match bindings are not ready.",
  "Nesne bekleniyor.": "Object expected.",
  "Geçersiz sayaç.": "Invalid counter value.",
  "En fazla 15 maç bağlanabilir.": "At most 15 matches can be bound.",
  "Geçersiz maç eşleştirmesi.": "Invalid match binding.",
  "Oyuncu listesi geçersiz.": "Invalid player list.",
  "Oyuncu kimliği geçersiz.": "Invalid player ID.",
  "Sunucudaki oyuncu 1v1 kadrosuyla uyuşmuyor.": "Server player does not match the 1v1 roster.",
  "Sunucudaki oyuncu kayıtlı kadroyla uyuşmuyor.": "Server player does not match the registered roster.",
  "Kafa vuruşu sayısı kill sayısını aşamaz.": "Headshot kills cannot exceed total kills.",
  "Oyuncu seri içinde takım değiştiremez.": "A player cannot switch teams during a series.",
  "Maç formatı bulunamadı.": "Match format not found.",

  // Model, Schedule, Engine, Client Offline Validation
  "Görünen isim 1–40 karakter olmalı; tırnak, ters eğik çizgi, noktalı virgül veya kontrol karakteri içeremez.":
    "Display name must be 1–40 characters and cannot contain quotes, backslashes, semicolons, or control characters.",
  "Logo PNG, JPEG veya WebP olmalı ve 64 KB’ı aşmamalı.": "Logo must be PNG, JPEG, or WebP and at most 64 KB.",
  "Logo dosyası okunamadı.": "Could not read logo file.",
  "Logo dosyası geçersiz veya 64 KB’tan büyük.": "Logo file is invalid or larger than 64 KB.",
  "Turnuva en fazla 8 takım içerir.": "Tournament supports at most 8 teams.",
  "Takım kimliği, seri başı veya kadro geçersiz.": "Invalid team ID, seed, or roster.",
  "Oyuncu kimliği veya SteamID64 geçersiz/tekrarlı.": "Invalid or duplicate player ID or SteamID64.",
  "Oyun içi ad kaynağı geçersiz.": "Invalid in-game name source.",
  "Kaptan kadrodan seçilmeli.": "Captain must be selected from the roster.",
  "MatchZy maç kimliği geçersiz/tekrarlı.": "Invalid or duplicate MatchZy match ID.",
  "Yer en fazla 100, maç notu en fazla 500 karakter olmalı.":
    "Location can be at most 100 characters and match notes at most 500 characters.",
  "Maç harita listesi geçersiz.": "Invalid match map list.",
  "Manuel maç ayarı geçersiz.": "Invalid manual match override.",
  "Site görünümü ayarı geçersiz.": "Invalid site presentation setting.",
  "Site görünümü açık/kapalı olmalı; aktif maç için bir turnuva maçı veya aktif maç yok seçilmeli.":
    "Presentation mode must be on/off; active match must be a tournament match or none.",
  "Organizatör iletişim bilgisi geçersiz.": "Invalid organizer contact information.",
  "Organizatör adı en fazla 80, iletişim bilgisi en fazla 240 karakter olmalı; kontrol karakteri içeremez.":
    "Organizer name can be at most 80 characters and contact info at most 240 characters without control characters.",
  "DatHost sunucu kimliği 24 karakterlik sunucu ID’si olmalı.":
    "DatHost server ID must be a 24-character server ID.",
  "Sunucu adresi host:port biçiminde olmalı; ör. sunucu.example:27015.":
    "Server address must be in host:port format, e.g. server.example:27015.",
  "Harita, taraf veya bot zorluğu geçersiz.": "Invalid map, side, or bot difficulty.",
  "İlk tur için geçerli bir takım ve maç yeri seç.": "Select a valid team and opening match slot.",
  "Hükmen sonuç BO1 13–0 veya BO3 2–0 olarak işaretlenmeli; harita istatistiği uydurulmaz.":
    "Forfeit must be marked as 13–0 (BO1) or 2–0 (BO3); map stats are not fabricated.",
  "Sonuç notu en fazla 300 karakter olabilir.": "Result note can be at most 300 characters.",
  "Bu maçın iki takımı henüz belli değil. Önce önceki maçları tamamla.":
    "Both teams for this match are not decided yet. Complete earlier matches first.",
  "Skorlar 0–100 arasında tam sayı olmalı.": "Scores must be integers between 0 and 100.",
  "BO3 serisi 2–0 veya 2–1 biter. Canlı seride henüz iki harita kazanılmış olamaz.":
    "A BO3 series finishes 2–0 or 2–1. A live series cannot have 2 map wins yet.",
  "BO3 skoru kazanılan harita sayısını gösterir; tek harita seçilmez.":
    "BO3 score shows map wins; a single map is not selected.",
  "BO1 sonucu geçerli bir MR12 skoru olmalı (ör. 13–8, 16–14 veya 19–17).":
    "BO1 result must be a valid MR12 score (e.g. 13–8, 16–14, or 19–17).",
  "Bu raunt skoru canlı bir MR12 maçına uygun değil. Maç bittiyse “Tamamlandı” seç.":
    "This round score is not valid for a live MR12 match. Select 'Completed' if finished.",
  "Listeden bir harita seç.": "Select a map from the list.",
  "Harita sayısı maç formatına uygun değil.": "Map count does not match the match format.",
  "Haritalar listeden seçilmeli ve tekrarlanmamalı.": "Maps must be selected from the pool without duplicates.",
  "Seri bittikten sonra ek harita oynanamaz.": "Additional maps cannot be played after the series ends.",
  "Yalnızca son harita canlı olabilir; tamamlanan seride canlı harita olamaz.":
    "Only the last map can be live; a completed series cannot contain a live map.",
  "BO1 sonucu harita skoruyla aynı olmalı.": "BO1 result must match the map score.",
  "Seri skoru biten haritaların sonucuyla aynı olmalı.": "Series score must match the completed map wins.",
  "Geçersiz turnuva dosyası.": "Invalid tournament file.",
  "Turnuva dosyası bu sürümle uyumlu değil.": "Tournament file is not compatible with this version.",
  "Dosyada bilinmeyen bir maç var.": "File contains an unknown match.",
  "Dosyada geçersiz final sonucu var.": "File contains an invalid finals result.",
  "Yerel provayı yönetim ekranından aç.": "Open local rehearsal from the admin screen.",
  "Prova modu kapalı.": "Rehearsal mode is disabled.",
  "Bu işlem çevrimiçi ve Steam doğrulaması gerektirir.":
    "This action requires online mode and Steam verification.",
  "Prova uygulandı fakat tarayıcı kaydı kullanılamıyor.":
    "Rehearsal applied, but browser storage is unavailable.",
  "API yanıtı geçersiz.": "Invalid API response.",
  "API bağlantısı hazır değil.": "API connection is not ready.",
  "API maç verisi geçersiz.": "Invalid API match data.",
  "API oyuncu verisi geçersiz.": "Invalid API player data.",
  "API kullanılamıyor.": "API is unavailable.",
  "5 MB’a kadar PNG, JPEG veya WebP seç.": "Select a PNG, JPEG, or WebP file up to 5 MB.",
  "Tarayıcı logoyu işleyemedi.": "Browser could not process the logo.",
  "Logo küçültülemedi. Daha sade bir görsel seç.": "Could not compress logo. Choose a simpler image.",
};

const dathostAdviceEn: Record<string, string> = {
  "401":
    "Check DATHOST_EMAIL and DATHOST_PASSWORD in Cloudflare Secrets; DatHost API authenticates with your account email and password.",
  "403":
    "Check this account's permission on the server. For shared accounts, set DATHOST_ACCOUNT_EMAIL to the server owner's email.",
  "404":
    "Check the server ID and whether the account can see this server. The ID is the 24-character ID in the DatHost panel.",
  "429": "DatHost rate limit reached. Wait a moment and test the connection again.",
};

export function translateServerMessage(text: string, lang: Lang): string {
  if (lang === "tr" || !text) return text;
  if (Object.hasOwn(exactEn, text)) return exactEn[text];

  let m = /^([A-Za-z0-9-]+) maçının kimliği kullanımda\. Kimliği elle değiştirmek yerine 'Yeni kimlikle tekrar oynat' işlemini kullan\.$/.exec(
    text,
  );
  if (m)
    return `Match ID for ${m[1]} is in use. Use 'Replay with new ID' instead of editing the ID manually.`;

  m = /^Sunucuda ([^\s]+) için işlem\/maç var\. Önce o maçı kapat\.$/.exec(text);
  if (m)
    return `There is an active match/operation for ${m[1]} on the server. End that match first.`;

  m = /^Sonucu veya hazırlığı temizlenecek maçlar: (.+)\.$/.exec(text);
  if (m) return `Matches whose results or prep will be cleared: ${m[1]}.`;

  m = /^Sonuçları temizlenecek: (.+)$/.exec(text);
  if (m) return `Results to be cleared: ${m[1]}`;

  m = /^Hükmen sonuç kaydedilecek\. Sunucudaki oyun ayrıca durdurulmalı; harita\/oyuncu istatistiği üretilmez\. Katılımcısı değişen sonraki maçların sonucu ve hazırlığı temizlenecek: (.+)\.$/.exec(
    text,
  );
  if (m) {
    const list = m[1] === "yok" ? "none" : m[1];
    return `Forfeit result will be saved. Stop any live game on the server separately; no map or player stats will be generated. Downstream matches with changed participants to be cleared: ${list}.`;
  }

  m = /^Yeni maç kimliğiyle tekrar oynanacak\. Hazırlığı\/sonucu temizlenecek sonraki maçlar: (.+)\. Eski istatistikler tarihçede saklanır\. Sunucuda önce mevcut maçı durdur\.$/.exec(
    text,
  );
  if (m) {
    const list = m[1] === "yok" ? "none" : m[1];
    return `A replay with a new match ID will be opened. Downstream matches whose prep/results will be cleared: ${list}. Previous stats remain in history. Stop the current server match first.`;
  }

  m = /^Sunucudaki backup durumuna göre veri yeniden beklenecek\. Sonraki ilk raundun toplam skoru (\d+) olmalı\. Etkilenecek sonraki maçlar: (.+)\.$/.exec(
    text,
  );
  if (m) {
    const list = m[2] === "yok" ? "none" : m[2];
    return `Live data will wait for the restored server backup. The next round's combined score must be ${m[1]}. Affected downstream matches: ${list}.`;
  }

  m = /^DatHost erişimi başarısız \(HTTP (\d+)\)\./.exec(text);
  if (m) {
    const status = m[1];
    const advice =
      dathostAdviceEn[status] ||
      "Check DatHost service status and try again later.";
    const uncertain = /Komutun sonucu belirsiz/.test(text)
      ? " The command outcome may be uncertain; check the server status in the DatHost console before retrying."
      : "";
    return `DatHost request failed (HTTP ${status}). ${advice}${uncertain}`;
  }

  return text;
}
