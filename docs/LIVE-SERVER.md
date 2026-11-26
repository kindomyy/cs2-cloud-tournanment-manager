# Among Us! · DatHost ile gerçek maç

Mevcut siten `workers.dev` üzerindeyse [adresine özel Workers rehberiyle](WORKERS.md) başla.

Yeni sürümde [admin panelinden sunucu yükleme ve kurtarma kontrolleri](OPERATIONS.md) kullanılabilir.

Metamod ve CounterStrikeSharp kurulmuş durumda. Sıradaki parça **MatchZy**; ardından site ile sunucu aynı maç dosyası üzerinden bağlanır. Manuel konsol yöntemi DatHost hesabını siteye bağlamayı gerektirmez; yeni panel kontrolleri için hesap bilgileri yalnızca Cloudflare Secrets’ta saklanır.

## 1. Siteyi ortak yönetimle yayınla

Cloudflare Pages, GitHub’daki `main` dalını kullansın: build `npm run build`, çıktı `dist`. Statik ZIP yerine bu kurulum gerekiyor; oyuncu girişi, veto ve skor API’si Pages Functions kullanıyor.

[Admin kurulumundaki](ADMIN.md#cloudflareda-kurulum) D1 migration’larını (0001–0004) uygula, `DB` bağını ve aşağıdaki ayarları ekleyip yeniden deploy et:

| Ayar                     | Değer                                                                     |
| ------------------------ | ------------------------------------------------------------------------- |
| `PUBLIC_ORIGIN`          | Sitenin tam HTTPS adresi; sonunda yol veya `/#admin` olmadan              |
| `ADMIN_PASSWORD`         | Kendi belirlediğin en az 12 karakterlik Secret                            |
| `MATCHZY_WEBHOOK_SECRET` | En az 24 karakterlik rastgele Secret; sunucuda da aynı değer kullanılacak |

`/#admin` açıldığında **ÇEVRİMİÇİ YÖNETİM** görünmeli. `/#oyuncu` üzerinden Steam girişinin aynı adrese dönmesini kontrol et. `/api/arena` JSON dönmeli; HTML dönüyorsa Functions yayınlanmamış demektir. D1 ve şema hazırken `/api/matches` içinde henüz olay gelmeden `configured: true, matches: []` görülmesi normaldir.

## 2. DatHost’ta MatchZy’yi kur

1. DatHost sunucunun mod/eklenti bölümünde MatchZy kurulumu varsa onu kullan. [MatchZy’nin resmi deposu](https://github.com/shobhit-pathak/MatchZy) DatHost için tek tıklamalı kurulumu belirtiyor.
2. Yoksa [resmi release](https://github.com/shobhit-pathak/MatchZy/releases) dosyalarını, dizin yapısını koruyarak sunucunun `game/csgo/` dizinine yükle. CounterStrikeSharp zaten kurulu olduğu için uyumlu **yalnızca MatchZy** paketini seç.
3. Sunucuyu yeniden başlat. DatHost’un **sunucu konsolunda** sırayla çalıştır:

```text
meta list
css_plugins list
```

İlkinde CounterStrikeSharp, ikincisinde MatchZy hatasız görünmeli. Görünmüyorsa eklenti yükleme hatasını düzeltmeden maç aşamasına geçme. Kurduğun MatchZy sürümünün [kurulum gereksinimlerini](https://shobhit-pathak.github.io/MatchZy/installation/) esas al: kontrol edilen güncel dokümanda CounterStrikeSharp **v369+ ve .NET 10 runtime** isteniyor. DatHost’tan kurulan iki eklentinin sürümleri uyumlu olmalı.

## 3. Webhook’u sunucuya yaz

[Örnek ayar dosyasını](../config/matchzy/config_override.cfg.example) kopyalayıp sunucuda **`game/csgo/cfg/MatchZy/config_override.cfg`** adıyla kaydet. `SENIN-SITEN` ve `SENIN_WEBHOOK_SECRETIN` alanlarını kendi değerlerinle değiştir. Var olan dosyan varsa bu ayarları ona ekle.

```text
matchzy_remote_log_url "https://SENIN-SITEN.pages.dev/api/webhooks/matchzy"
matchzy_remote_log_header_key "Authorization"
matchzy_remote_log_header_value "Bearer SENIN_WEBHOOK_SECRETIN"
matchzy_ready_mode 0
matchzy_time_to_start 0
```

Son iki satır, oyun içi `.ready` akışını seçer ve hazır beklerken süre dolduğu için hükmen sonuç oluşmasını önler. Güncel MatchZy, `config_override.cfg` dosyasını kendi `config.cfg` dosyasından sonra yükler; güncelleme kişisel override dosyasını değiştirmez. Yeniden başlattıktan sonra eklenti listesini tekrar kontrol et. Eski bir MatchZy sürümünde override desteği yoksa sürümün kendi belgelerinde belirtilen yapılandırma dosyasını kullan.

Secret’ı sohbete, GitHub’a veya herkese açık ekran görüntüsüne koyma. DatHost ve Cloudflare ayarlarında kendin tut.

## 4. Gerçek kadroları ve vetoyu hazırla

1. Admin panelinde gerçek takım isimlerini, logolarını, beşer oyuncuyu, **SteamID64** kayıtlarını ve kaptanları kaydet. Oyun içi oyuncu adının başına takımın kısa adı eklenir. [Steam adı seçimini ve kayıtları yönetme](ADMIN.md#steam-kayıtları-ve-oyun-içi-adlar).
2. **Turnuva & API** bölümünde prova iznini kapat. Yeni kurulumda varsayılan kapalıdır. Daha önce prova yapılmışsa eski prova vetosunu sıfırla.
3. Oyuncular Steam ile giriş yapıp **Hazırım** desin. 10 oyuncu hazır olduğunda tam sayfa veto açılır. Sırası gelen kaptan hamle yapar.

Küçük kadrolarla rekabetçi maç için her takıma eşit sayıda 1–5 oyuncu ekle ve her oyuncunun SteamID64 kaydını kaydet. İki takımı aynı eşleşmeye yerleştirip **Gerçek vetoyu zorla başlat** düğmesini kullan. 1v1 için takım başına bir oyuncu yeterli.
4. Hazır işaretinde sorun yaşanırsa **Maçlar & Takvim → Gerçek vetoyu zorla başlat → Onayla ve uygula** kullan. Bu seçenek 10 SteamID kaydını yine zorunlu tutar; hazır/Steam doğrulama kaydı uydurmaz. Kaptanlar hamle yapabilmek için giriş yapar; admin de müdahale edebilir.
5. Veto bitince 3,5 saniye sonra ana sayfaya dönülür. Seçilen maç ve ilk haritası scoreboard’da görünür. Bu aşamada oyun sunucusu henüz maç dosyasını almamıştır.

BO1 altı ban ve kalan harita; BO3 ban/ban/pick/pick/ban/ban/kalan düzenindedir. Başlangıç tarafı bıçak raunduyla belirlenir.

## 5. Veto biten maçı sunucuda yükle

Önerilen yöntem: [operasyon rehberindeki](OPERATIONS.md#4-maçı-tek-düğmeyle-sunucuya-yükle) API ayarlarını tamamlayıp **Maçı sunucuya yükle** düğmesini kullan.

Manuel alternatif: Admin panelinde ilgili maçı seç. **MatchZy maç dosyası** bağlantısını bağlantısını göreceksin. Örneğin U1 için DatHost sunucu konsolunda:

```text
matchzy_loadmatch_url "https://SENIN-SITEN.pages.dev/api/match-config?match=U1" "Authorization" "Bearer SENIN_WEBHOOK_SECRETIN"
```

Bu komut maçı yapılandırır ve haritayı yükleyebilir; maçın ortasında çalıştırma. Dosyada gerçek kadrolar, isimler, harita sırası, `skip_veto: true` ve takım başına `min_players_to_ready: 5` bulunur. MatchZy oyun isimlerini SteamID’ye bağlı olarak zorlar. Dosya Secret içermez; URL’ye erişim admin oturumu veya Authorization başlığı gerektirir.

**Sitedeki Hazırım, oyun içi `.ready` yerine geçmez.** Dosya yüklendikten sonra iki takımın kadrosundaki oyuncular `.ready` yazar. Bıçak raundunu kazanan takım `.stay` veya `.switch` ile tarafını seçer. Oyun içi admin başlangıcında sorun olursa MatchZy’nin kendi admin komutları kullanılabilir; bu site RCON üzerinden otomatik maç başlatmaz.

## 6. İlk bağlantıyı doğrula

İlk gerçek raunttan sonra sitede doğru eşleşmenin skoru ve K/D/A değerleri görünmeli. Site açıkken yaklaşık 5 saniyede bir yenilenir. Hasar/ADR/rating, MatchZy ilgili alanları gönderince dolacak.

| Belirti                                  | Kontrol                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Unknown command: matchzy_loadmatch_url` | MatchZy yüklenmemiş; `css_plugins list` ve eklenti logunu incele                                |
| Maç dosyası 401                          | Komuttaki Bearer Secret ile Cloudflare Secret aynı mı?                                          |
| Maç dosyası 422                          | Veto gerçek modda tamamlandı mı, kadrolar eksiksiz mi?                                          |
| MatchZy ID sınırı hatası                 | Güncel sürüm `1–2147483647` ister. Panelde eski ID için **Uyumlu ID oluştur**, sonra kaydet     |
| Maç yükleniyor, skor gelmiyor            | Sunucudaki remote log URL/Authorization ayarlarını ve Cloudflare Functions loglarını kontrol et |
| Webhook 422                              | Sunucudaki SteamID’ler ve harita sırası sitedeki maç dosyasıyla uyuşuyor mu?                    |
| Veto var, dosya açılmıyor                | Prova vetosu gerçek sunucu dosyası üretmez; sıfırlayıp gerçek veto aç                           |

Yeni maç kimlikleri MatchZy’nin sayı sınırına uygundur. Henüz kullanılmamış eski kurulumların büyük kimlikleri otomatik yenilenir; başlamış maçların kimliği otomatik değiştirilmez. Tekrar oynatılacak bir maçta eski bitmiş kimliği yeniden kullanma.

Yerel testler yönetim/veto/maç dosyası/webhook akışını doğrular. Senin gerçek DatHost ve Cloudflare bağlantın, site adresi ve MatchZy kurulumu netleştiğinde bu son raunt kontrolüyle doğrulanacak.
