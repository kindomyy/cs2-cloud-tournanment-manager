# Admin, Steam ve tam sayfa veto

Yeni takvim, sunucu kontrolleri ve tam yedekleme için [adım adım operasyon rehberini](OPERATIONS.md) kullan. Yeni `0004_operations.sql` dosyası gerekir.

`workers.dev` üzerinden yayın için [Workers kurulumunu](WORKERS.md) kullan. Aşağıdaki Pages adımları `pages.dev` projeleri içindir.

## Hızlı prova

`/#admin` adresini aç. Çevrimiçi kurulum yoksa **Yerel yönetim provasını aç** ile kadro, SteamID, kaptan, takvim, skor ve veto ekranlarını dene. **Maçlar & Takvim → Prova vetosunu aç → Tam sayfa veto** ayrı bir sayfa açar.

Yerel prova gerçek giriş değildir; Steam doğrulamaz ve diğer cihazlara yazmaz. Kadro/takvim tarayıcıda saklanır; veto provası sayfa açıkken çalışır. Gerçek ortak veto için aşağıdaki kurulum gerekir.

## Cloudflare'da kurulum

GitHub bağlantılı Pages projesinde build `npm run build`, çıktı `dist`. `functions/` da yayınlanır. Statik ZIP yalnızca arayüz/prova içindir.

1. D1 veritabanını **DB** adıyla bağla.
2. SQL konsolunda [0001_matchzy.sql](../migrations/0001_matchzy.sql) ve [0002_management.sql](../migrations/0002_management.sql) dosyalarını çalıştır. Ardından [0003_private_duels.sql](../migrations/0003_private_duels.sql) ve [0004_operations.sql](../migrations/0004_operations.sql) dosyalarını uygula. Yalnızca eksik dosyaları ekleyebilirsin; mevcut kayıtlar silinmez.
3. Pages **Variables and Secrets** bölümüne aşağıdaki ayarları ekle, sonra yeniden deploy et.

| Ayar                     | Tür    | İçerik                                                                                                                     |
| ------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_PASSWORD`         | Secret | En az 12 karakterlik yönetici parolan. Kaynak koda veya sohbete yazma.                                                     |
| `PUBLIC_ORIGIN`          | Metin  | Sitenin gerçek adresi: `https://SENIN-SITEN.pages.dev`. Yol veya `/#admin` ekleme. Giriş yaptığın alan adıyla aynı olmalı. |
| `MATCHZY_WEBHOOK_SECRET` | Secret | Sunucudaki remote log başlığında da kullanılan özel değer; en az 24 karakter.                                              |

Üretim ve preview ortamlarının ayarları ayrı olabilir. `/#admin` üzerinden parola ile giriş yap. Panelde **ÇEVRİMİÇİ YÖNETİM** yazmalı; **YEREL PROVA** yazıyorsa D1/şema bağlantısını kontrol et.

Oturumlar D1'de token özetiyle saklanır; çerez HttpOnly, SameSite=Lax ve HTTPS'te Secure'dür. Yazma istekleri kaynak ve rol kontrolü gerektirir. Beş yanlış girişten sonra 10 dakika beklenir. Sürüm kontrolü başka bir adminin değişikliğini ezmeyi önler.

## Takımlar, kadrolar ve takvim

- **Takımlar & Oyuncular:** takım adı/kısa adı/renk/seri başı, takım ekleme-silme, beş kişiye kadar kadro, SteamID64, görünen isim ve kaptan. Bu sürüm 8 seri başı yuvalı çift eleme ağacıdır; boş yuvalar ilgili maçı bekletir.
- Admin takım logosu yükleyebilir. Kaptan, Steam ile giriş yaptıktan sonra **Oyuncu → Takımının kimliği** bölümünden yalnızca kendi takımının adını, kısa adını ve logosunu değiştirebilir. PNG/JPEG/WebP dosyaları 256×256 boyuta küçültülür. İsim ve logo değişikliği sonuçları/vetoyu sıfırlamaz.
- SteamID64, 17 haneli **metindir**. Aynı SteamID veya seri başı iki yerde kullanılamaz. SteamID yazmak kimlik doğrulaması değildir; oyuncu kendi hesabıyla Steam'den giriş yapmalıdır.
- **Maçlar & Takvim:** tarih belirtilmedi veya ayrıntılı Türkiye tarih/saati, isteğe bağlı süre/yer/not, MatchZy maç kimliği, BO1/BO3 sonuçları ve harita detayları. Takvim üstteki kaydet düğmesiyle, skor ayrı düğmeyle kaydedilir.
- **Maçlar & Takvim → İlk tur eşleşmeleri:** U1–U4 maçlarının birinci ve ikinci takımlarını doğrudan seç. Başka maçtaki bir takımı seçersen o iki takım yer değiştirir; bir takım iki eşleşmeye yazılmaz. Üstteki **Değişiklikleri kaydet** ile uygula. Seri başı alanı da aynı şekilde takas yapar. Hazırlık/sonuç varsa turnuvayı sıfırlama onayı gösterilir; iptal edersen mevcut eşleşmeler ve veto korunur.
- **Turnuva & API:** turnuva adı, prova izni, tüm turnuvayı sıfırlama ve bağlantı durumu.

Kadro/SteamID/kaptan değişiklikleri gelecek maçlara uygulanır. Vetosu başlamış ve oynanmış maçlar kendi kadrosunu korur; bütün turnuva sıfırlanmaz. Henüz yüklenmemiş seçili maça yeni kadro uygulamak için **Seçili maçın kadrosunu yenile** kullan. Takım ekleme/silme veya seri başı değişikliğinde sıfırlama onayı gerekir. Skor düzeltmesi takımları değişen sonraki maçların sonuç/hazırlıklarını temizler ve kimliklerini yeniler.

**Sistem & Yedek:** SQL ve servis durumu, gerçek DatHost bağlantı testi, son webhook, işlem geçmişi, tam dışa aktarma ve doğrulanan atomik geri yükleme.

## Steam girişi ve hazır olma

Oyuncu menüsündeki **Steam ile doğrula**, Steam OpenID kullanır. Şifre siteye gelmez. Sunucu, cevabı doğrudan Steam'e doğrulatır; kimlik, imzalanmış alanlar, dönüş adresi ve tek kullanımlık durum kontrol edilir. Elle yazılmış SteamID ile giriş yapılmaz. Bu akış Web API anahtarı gerektirmez; VAC veya oyun sahipliği kontrolü yapıldığı iddia edilmez.

Doğrulanan kimlik kadroda yoksa yöneticiye ekletilmesi beklenir. Oyuncu kendi maçına **Hazırım** diyebilir. Hazır işareti 30 dakika geçerlidir; çevrimiçi varlık göstergesi değildir. İki kadronun beşer oyuncusu doğrulanıp hazır olunca veto otomatik açılır. Başladıktan sonra hazır durumu kilitlenir.

## Veto

- BO1: A ban → B ban → A ban → B ban → A ban → B ban → kalan harita.
- BO3: A ban → B ban → A pick → B pick → A ban → B ban → karar haritası. Oyun sırası A pick, B pick, karar haritası.
- Yalnızca sırası gelen kaptan hamle yapar. Diğer oyuncular ve izleyiciler takip eder. Admin müdahalesi hamle geçmişinde görünür.
- Önce harita seçilir, sonra onaylanır. Sürüm kontrolü iki eş zamanlı hamleden yalnızca birini kabul eder. Çevrimiçi veto sayfa yenilemesinde D1'den devam eder.
- Başlangıç tarafı sunucuda bıçak raunduyla belirlenir.
- Veto tamamlanınca 3,5 saniye sonra ana sayfaya dönülür; ilgili maç ve seçilen harita öne çıkar.
- Admin **Gerçek vetoyu zorla başlat** seçeneğiyle hazır kontrolünü onaylayarak aşabilir. 10 SteamID64 kaydı yine gereklidir. Hazır veya doğrulanmış oyuncu kaydı üretilmez. Bu seçenek oyun sunucusuna RCON komutu göndermez.
- **PROVA** vetosu gerçek doğrulama gibi gösterilmez; sunucuya gerçek maç dosyası üretmez ve webhook eşleştirmesi oluşturmaz.
- Gerçek oyuncu hazırlığına geçmeden önce admin panelinden prova vetosunu sıfırla. Provalar diğer kullanıcıların ekranını otomatik açmaz; gerçek 10/10 hazır geçişi açar.

## Steam kayıtları ve oyun içi adlar

**Yönetim → Steam kayıtları** ekranında SteamID64, Steam profil adı, kadro, son doğrulama, MatchZy’den gelen son ad ve yeni maçta kullanılacak adı görebilirsin. Oyuncu Steam’de adını değiştirdiyse admin **Profil adını yenile** düğmesini kullanabilir. Oyuncu da kendi **Hesap ayarları** ekranından profilini yenileyebilir.

Turnuva maçlarının MatchZy dosyasında takımın **Kısa ad** alanı oyuncu adının başına eklenir. Kısa ad `123`, oyuncu adı `abcd` ise CS2’de `123 | abcd` görünür. Sitedeki hesap ve kadro adları kendi kaynaklarını kullanır. Oyuncu bazında **Oyun içinde Steam adını kullan** seçilirse yeni maç dosyası en son alınan geçerli Steam adını kullanır. Steam adı alınamamışsa kadro adı kullanılır. Özel 1v1 odaları kendi oyuncu adlarını kullanır.

Gerçek veto bitince admin panelindeki **MatchZy maç dosyası** bağlantısı açılır. MatchZy dosyadaki SteamID64 ve oyuncu adı eşlemesini okur. Maçın kadro adı ve takım etiketi veto açıldığında sabitlenir. Kadroda yapılan düzenlemeler sonraki eşleşmelere geçer. Canlı oyun, yüklenirken aldığı adlarla sürer.

Sunucuda yer tutucuları kendin değiştirerek:

```text
matchzy_loadmatch_url "https://SENIN-SITEN.pages.dev/api/match-config?match=U1" "Authorization" "Bearer SENIN_WEBHOOK_SECRETIN"
```

Dosya; maç kimliğini, gerçek kadroları ve veto haritalarını içerir. `skip_veto: true` CS2'de ikinci kez veto açılmasını önler. Gizli anahtar dosyaya konmaz. Remote log ayarları [MatchZy rehberindeki](MATCHZY.md) gibi ayrıca gerekir. Yeni yönetim akışında eşleştirme biten vetodan otomatik çıkar; `MATCHZY_BINDINGS` eski kurulumlar için desteklenir.

Sunucuya REST üzerinden yükleme, duraklatma, devam, bitirme ve backup kontrolleri [operasyon rehberindeki](OPERATIONS.md) DatHost Secrets ayarlarıyla kullanılabilir.

## Hasar ve Arena Rating 1.0

Yalnızca **bu maçın** `damage` ve `rounds_played` değerleri toplanır. ADR = hasar / oyuncunun oynadığı raunt. Rating HLTV'nin özel formülü değildir:

```text
0.45 × (raunt başına kill / 0.70)
+ 0.35 × (ADR / 80)
+ 0.20 × (hayatta kalınan raunt oranı / 0.32)
```

0–3 aralığında iki ondalık gösterilir. Hasar/raunt yoksa rating ve ADR `—` kalır. Bu açıklama tabloda da yer alır.

## Doğrulama sınırı

Yerel Pages/D1 ve otomatik testler; admin oturumu, Steam kontrol mantığı, yetki, 10/10 hazır geçişi, eş zamanlı veto, maç dosyası ve rating'i doğrular. OpenID otomatik testlerinde sağlayıcı cevabı kontrollü taklit edilir. Gerçek Steam hesabıyla üretim dönüşü, DatHost maç bağlantısı ve senin Cloudflare ayarların hizmetler hazır olduğunda ayrıca denenmelidir.

Fotoğraf kaynakları: [public/maps/SOURCES.md](../public/maps/SOURCES.md).

Gerçek DatHost sunucusu için adım adım kurulum: [Among Us! canlı sunucu rehberi](LIVE-SERVER.md).

10 kişi bulmadan denemek için [Özel 1v1](1V1.md): yönetici mevcut hesabıyla `/#1v1` üzerinden iki SteamID64 ile oda açar. Yeni `0003_private_duels.sql` tablosu gerekir; sonuçlar turnuva ağacından ayrıdır.
