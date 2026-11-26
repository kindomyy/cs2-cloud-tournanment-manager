# Roller ve erişim sınırları

Yetki tarayıcıdan gönderilen role, takım kimliğine veya oyuncu kimliğine göre verilmez. Sunucu, HttpOnly oturumunu ve kayıtlı kadroyu kullanır. Düğme gizlemek tek başına yetki kontrolü değildir.

| Rol | Yapabilecekleri | Sınır |
| --- | --- | --- |
| Ziyaretçi | Maçları, sonuçları, takımları, kuralları ve gerçek veto ilerleyişini okumak | Hazır veremez; takım, kadro, veto, sonuç veya sunucu değiştiremez. Sunucu bağlantısı ve yönetim kayıtları gösterilmez. |
| Oyuncu | Kayıtlı olduğu maçta kendi hazır durumunu değiştirmek; kendi özel 1v1 odasına erişmek | Başkası adına hazır veremez. Kadro, kaptan ve seri başı değiştiremez. |
| Kaptan | Oyuncunun yetkileri; kendi takımının adı, kısa adı ve logosunu düzenlemek; kendi sırasındaki gerçek veto hamlesi | Başka takımı düzenleyemez. Oyuncu ekleyemez, SteamID ve kaptan atayamaz. Prova vetosu yöneticiye aittir. |
| Site admini | Kadrolar, kaptan atama, eşleşme, takvim, skor, veto müdahalesi, sunucu kontrolü ve özel oda oluşturma | Admin girişi Steam doğrulaması değildir. Oyuncu adına hazır veremez; gerektiğinde açıkça hazır kontrolünü aşan işlemi kullanır. |

Steam girişi tek başına turnuva oyuncusu veya kaptanı yapmaz. Kadro eşleşmesi gerekir. Kaptan adminin kaydettiği kadrodan alınır. Başlamış maçlar dondurulmuş kadroyu ve kaptanını kullanır.

Bir oyuncu kaydının SteamID’si değiştirildiğinde yeni hesap eski hesabın doğrulamasını veya maç hazırlığını devralmaz. Doğrulamalar güncel kadro ve maçın saklanan kadrosu için ayrı değerlendirilir. Kadrodan çıkarılan oyuncu sürmekte olan kayıtlı maçına katılabilir; maç sonuçlandığında bu geçmiş katılım yeni sunucu erişimi sağlamaz. Eski maçın kaptanı güncel takım profilini düzenleyemez; yeni kaptan da eski maçın veto yetkisini devralmaz.

## Tarayıcıya gönderilen veriler

- Admin yönetim için gereken tam görünümü alır.
- Diğer kullanıcılar başka oyuncuların kayıtlı SteamID listesini veya tüm Steam doğrulama kayıtlarını alamaz; yalnızca kendi SteamID bilgisini alır.
- Doğrulanma ve hazır durumları oyuncu kayıt kimlikleriyle gösterilir.
- DatHost kimliği ve kurtarma ayrıntıları admin dışına verilmez. Sunucu bağlantısı kayıtlı oyuncuya veya admine; özel 1v1 bağlantısı ilgili odanın oyuncusuna veya admine verilir.
- Admin provası ziyaretçi ve oyuncu görünümüne girmez. Kaptan prova hamlesi yapamaz.
- Canlı/tamamlanan maç istatistiklerindeki SteamID kimlikleri herkese açık maç performansının parçasıdır. Bu uç özel 1v1 istatistiklerini veya tüm doğrulanmış hesapları yayınlamaz.

Maç dosyaları ve sunucu kontrolleri admin oturumu veya gereken sunucu anahtarı ister. Yazma uçları ayrıca istek kaynağını doğrular. Özel odanın adresi bilinse bile ilgili oyuncu ve admin dışına erişim kapalıdır.
