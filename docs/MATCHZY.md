# DatHost / MatchZy: canlı skor ve oyuncu istatistikleri

Akış: **DatHost'taki MatchZy → HTTPS webhook → Cloudflare Pages Functions → D1 → sitedeki scoreboard**.

Metamod ve CounterStrikeSharp kurulmuş gerçek DatHost sunucusu için [adım adım canlı kurulum rehberi](LIVE-SERVER.md) ile başla. Güncel yönetim akışında eşleştirme gerçek veto tamamlanınca otomatik oluşur.

DatHost REST API anahtarı bu akış için gerekli değildir. MatchZy'nin yerleşik remote log özelliği kullanılır. Sunucu hazırlanmadıysa arayüz kullanılabilir; gerçek K/D/A ve HS% yerine `—` gösterilir. Örnek turnuva ile API turnuvası ayrı tutulur; sunucu verisi kişisel deneme kaydını değiştirmez.

## Yeni yönetim akışı

Admin paneli ve oyuncu vetosuyla kullanacaksan önce [yönetim kurulumunu](ADMIN.md) uygula. İkinci migration, admin/Steam ayarları ve veto tamamlandıktan sonra eşleştirme otomatik oluşur. Aşağıdaki `MATCHZY_BINDINGS` yöntemi eski webhook kurulumu için hâlâ desteklenir.

## Cloudflare'da bir kez yapılacaklar

Bu bölüm **GitHub bağlantısıyla yayınlanan Pages projesi** içindir. Kaynak depodaki `functions/` dizini de yayınlanmalıdır. Statik ZIP yüklemek yalnızca arayüzü sağlar; webhook'u kurmaz.

1. Cloudflare **D1** bölümünde `kampus-arena` adında bir veritabanı oluştur.
2. Veritabanının SQL konsolunda [migrations/0001_matchzy.sql](../migrations/0001_matchzy.sql) içeriğini çalıştır.
3. Pages projenin **Settings → Bindings** bölümünde D1 bağla: değişken adı **`DB`**, veritabanı `kampus-arena`.
4. **Variables and Secrets** bölümünde aşağıdaki iki ayarı ekle. Üretim ve önizleme ortamları ayrı olabilir; test edeceğin ortamı seç.
5. Pages projesini yeniden deploy et. Build komutu `npm run build`, çıktı dizini `dist` olarak kalır; Cloudflare `functions/` dizinini ayrıca derler.

| Ad                       | Tür             | İçerik                                                                                                                                                                                |
| ------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MATCHZY_WEBHOOK_SECRET` | Secret          | Kendin oluşturduğun en az 24 karakterlik rastgele, özel bir değer. Aynı değer MatchZy'nin Authorization başlığında kullanılır. Git'e, sohbet mesajına veya `VITE_` değişkenine koyma. |
| `MATCHZY_BINDINGS`       | Metin değişkeni | MatchZy maç kimliğini, sitedeki maç ve takımlarla bağlayan aşağıdaki JSON. Gizli bilgi içermez.                                                                                       |

Örnek eşleştirme; kendi maç kimliklerine, takım sırasına ve harita listene göre düzenle:

```json
{
  "27": {
    "matchId": "U2",
    "team1": "parallax",
    "team2": "void",
    "maps": ["Nuke"]
  },
  "28": {
    "matchId": "U5",
    "team1": "nova",
    "team2": "parallax",
    "maps": ["Mirage", "Inferno", "Nuke"]
  }
}
```

- `27`/`28`, MatchZy maç yapılandırmasındaki sayısal `matchid` değeridir. Her yeni maç/prova için yeni bir kimlik kullan; eski bitmiş maç kimliğini yeniden kullanma.
- `matchId`, sitedeki `U1`…`U7`, `L1`…`L6`, `GF` veya `GF2` kimliğidir.
- `team1` ve `team2`, [src/data.ts](../src/data.ts) içindeki sabit takım kimlikleridir. MatchZy'nin team1/team2 sırası sitedeki birinci/ikinci takımla aynı olmalıdır. Takım adlarını bu dosyadan gerçek adlarla değiştirebilirsin; kimlikleri koru.
- BO1 için 1, BO3 için 3 farklı harita adı gerekir. Liste oyunun harita sırasını göstermelidir. Harita sırasını maçtan önce kesinleştir; oynanan maçın eşleştirmesini sonradan başka maça çevirme.
- Önceki tur sonuçları gelmeden veya API eşleşmesinin takımları turnuva ağacıyla uyuşmadan sonuç ilerletilmez. Ana sayfada hangi eşleşmenin kontrol edilmesi gerektiği gösterilir. Gerçek veriye örnek maç sonuçları karıştırılmaz.

## DatHost sunucusunda MatchZy ayarı

MatchZy kurulu CS2 sunucunun MatchZy yapılandırmasına şu komutları ekle; alanları kendin değiştir:

```text
matchzy_remote_log_url "https://SENIN-SITEN.pages.dev/api/webhooks/matchzy"
matchzy_remote_log_header_key "Authorization"
matchzy_remote_log_header_value "Bearer SENIN_GIZLI_DEGERIN"
```

`Bearer ` sözcüğünden sonra bir boşluk vardır. Gizli değer Cloudflare'daki `MATCHZY_WEBHOOK_SECRET` ile aynı olmalı. Sadece server.cfg kullanıyorsan komutları MatchZy yüklendikten sonra uyguladığından emin ol. MatchZy maç yapılandırmasındaki `cvars` da bu ayarları destekler.

MatchZy maç yapılandırmasında `matchid` eşleştirmeye uygun olmalı. BO1'de `num_maps: 1`, BO3'te `num_maps: 3` ve `clinch_series: true` kullan. `maplist` sırası yukarıdaki harita listesiyle uyuşmalı (`de_nuke` → `Nuke`, `de_dust2` → `Dust2`). Takımların gerçek SteamID64 kadrolarını MatchZy maç yapılandırmasına gir. İstatistikler rumuz eşleştirmek yerine SteamID64 üzerinden birleştirilir; aynı adlı oyuncular karışmaz.

## Sitede ne görünür?

- `round_end`: mevcut haritanın toplu oyuncu istatistikleri ve raunt skoru güncellenir.
- `map_result`: harita tamamlanır. BO3 seri sonucu biten haritaların kazananlarından hesaplanır; raunt skoru seri skoru yerine yazılmaz.
- K / D / A: öldürme, ölüm, asist. Ayrı sütunlar gösterilir; hesaplanmış bir KDA oranı değildir.
- HS%: `toplam headshot_kills / toplam kills × 100`. Kill sayısı sıfırsa %0; henüz veri yoksa `—`. BO3'te yüzdeler ortalanmaz, kill sayıları haritalar arasında toplanıp oran hesaplanır.
- Ana sayfa ve maç detaylarında BO1 raunt sonucu; BO3'te seri skoru ve her haritanın raunt sonucu ayrı görünür. 2–0 biten seride üçüncü harita **oynanmadı** olarak gösterilir.
- Site görünürken yaklaşık 5 saniyede bir API kontrol edilir; oyun verisi her raunt sonunda gelir. Gizli sekmede sorgu durur. Hata olduğunda son iyi veri korunur ve bağlantı uyarısı gösterilir.
- İkinci final kuralı gerçek API turnuvasında açıktır; herkes iki yenilgide elenir. Kişisel denemenin final ayarı gerçek API turnuvasını değiştirmez.

## Bağlantı kontrolü

`https://SENIN-SITEN.pages.dev/api/matches` adresini aç:

- **200**, `configured: true`, `matches: []`: D1 ve eşleştirme hazır, ilk olay bekleniyor.
- **200**, maçlar dolu: MatchZy verisi alınıyor. Menüde `MATCHZY / API` görünür.
- **503**: D1 bağı, şema veya değişkenleri kontrol et. Statik dosya yüklemesi Functions sağlamaz.
- Webhook **401**: Authorization başlığını ve Secret değerini kontrol et.
- Webhook **422**: sayısal maç kimliği, sıfırdan başlayan `map_number`, harita sırası veya veri biçimi eşleşmiyor.

## Doğrulananlar ve sınırlar

Kaynak şema, [MatchZy Events.cs](https://github.com/shobhit-pathak/MatchZy/blob/21c278070f9ef4eddcb0baf8f860a8e007271af6/Events.cs), [MatchData.cs](https://github.com/shobhit-pathak/MatchZy/blob/21c278070f9ef4eddcb0baf8f860a8e007271af6/MatchData.cs) ve [remote log ayarları](https://github.com/shobhit-pathak/MatchZy/blob/21c278070f9ef4eddcb0baf8f860a8e007271af6/RemoteLogConfig.cs) üzerinden doğrulandı.

Yerelde gerçek Pages Functions + D1 emülatörüyle yetkilendirme, olay kabulü, public GET ve istatistiklerin tarayıcıda görünmesi test edildi. Tekrar gelen kümülatif olaylar toplanmaz; eski rauntlar skoru geriletemez. Son round_end, map_result ile son kez güncellenebilir; sonrasında kilitlenir.

MR12 ve MR3 uzatmalar desteklenir. Hükmen sonuç, özel raunt limitleri ve aynı maç kimliğinde backup restore ile geriye sarma bu sürümün kapsamı dışındadır. Böyle bir yeniden oynatma için yeni MatchZy maç kimliği kullanıp eski eşleştirmeyi kaldır. Olayların eksik tesliminde sistem harita sonucu uydurmaz; eksik eski harita ulaşana kadar seri bekler. Oyun sunucusunun loglarını kontrol etmek gerekir; bu sürüm MatchZy'ye geçmiş olaylar için geri sorgu yapmaz.

Henüz gerçek DatHost sunucusu bağlanmadığı için üretimdeki erişim ve gerçek maç verisi bu doğrulamaya dahil değildir. D1 ortak API verisini saklar; kişisel deneme ekranı gerçek sunucuya sonuç yazmaz. Yönetici paneli ve takım düzenleme [yönetim rehberinde](ADMIN.md) açıklanır.
