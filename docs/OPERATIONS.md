# Among Us! · Yeni yönetim ekranlarını kullanma

Bu sürümde takvim, sunucu kontrolü, sonuçlar ve tam yedekleme admin panelinden yönetilir. Canlı sunucu bilgileri bu çalışma ortamında bulunmadığından DatHost’a gerçek maç komutu gönderilmedi; API davranışı kontrollü yanıtlarla, kayıtlar gerçek yerel SQLite/D1 ile test edildi.

## 1. Yeni SQL dosyasını uygula

Önceden 0001, 0002 ve 0003 dosyalarını uyguladıysan yalnızca yeni dosya gerekiyor:

1. GitHub’da [0004_operations.sql](../migrations/0004_operations.sql) dosyasını aç. **Raw** düğmesine bas, metnin tamamını kopyala.
2. Cloudflare panelinde sol menüden **Storage & databases → D1 SQL Database** bölümüne gir.
3. Worker’ın **Bindings** ekranında `DB` karşısında yazan veritabanını seç. Başka veritabanı oluşturma.
4. **Console** sekmesini aç. Kopyaladığın SQL metnini yapıştır ve **Execute** düğmesine bas.
5. **Success** gördüğünde siteyi yeniden aç. `/#admin` üzerinden giriş yapıp **Sistem & Yedek → Durumu yenile** düğmesine bas. **SQL tabloları: Hazır** görünmeli.

İlk kurulumda önce [0001](../migrations/0001_matchzy.sql), [0002](../migrations/0002_management.sql), [0003](../migrations/0003_private_duels.sql), sonra 0004 uygulanır. Dosyalar mevcut kayıtları silmez. Eksik şemada eski temel özellikler çalışmaya devam eder; yeni operasyonlar kurulum mesajı gösterir.

## 2. DatHost API erişimini ekle

DatHost’un resmi API’si hesap e-postası ve parolasıyla HTTP Basic kullanır. Bu bilgiler yalnızca Cloudflare Worker’dan DatHost’a gider. Sitedeki kullanıcılar, yedekler ve işlem geçmişi bunları almaz.

1. Cloudflare → **Workers & Pages → cs2-tournanmentmanager → Settings** aç.
2. **Variables and Secrets → Add** düğmesine bas.
3. Türü **Secret**, adını `DATHOST_EMAIL`, değerini DatHost giriş e-postan yap. Kaydet.
4. Tekrar **Add**: tür **Secret**, ad `DATHOST_PASSWORD`, değer DatHost giriş parolan. Kaydet. Bunları sohbete yazma.
5. Sunucu başka bir hesap tarafından sana paylaşılmışsa `DATHOST_ACCOUNT_EMAIL` adında ayrıca Secret ekle; değeri sunucunun sahibi olan hesabın e-postası olsun. Kendi sunucunsa gerekmez.
6. Değişiklikleri **Deploy** ile uygula. Panelde yalnızca “Save” varsa kaydedip **Deployments → en son build → Retry/Rebuild** kullan. Build `npm run build`, deploy `npm run deploy:worker` olmalı.
7. Sitede **Yönetim → Turnuva & API** aç. **DatHost sunucu ID** alanına DatHost konsol adresinin sonundaki 24 karakterlik sunucu kimliğini yaz; örneğin `6aeb4b88dfc88e8d331a5288`. Bu alana `Bearer` veya parola yazılmaz.
8. **Sunucu bağlantı adresi** alanına DatHost’un **Connect** bölümünde görünen `host:port` veya `IP:port` bilgisini yaz. Konsol sayfasının web adresini yazma. **Değişiklikleri kaydet** düğmesine bas.
9. **Sistem & Yedek → DatHost bağlantısını test et** düğmesine bas. Bu düğme yalnızca sunucu bilgisini okur. Başarılı testte sunucu adı ve bağlantı adresi görünür; oyun başlatmaz.

**Ayarlar girildi** ile **Son bağlantı testi başarılı** ayrı durumlardır. Test kaydı tarih ve saatiyle gösterilir; sürekli bağlantı garantisi değildir. Sunucu ID’si, hesap veya Secret değiştiğinde yeniden test gerekir. Son test başarısızsa önceki başarılı test yalnızca geçmiş bilgisi olarak kalır. Başarısız API testi oyun sunucusunun kapalı olduğunu tek başına göstermez; mesajdaki HTTP koduna göre hesap, erişim izni veya ağ bağlantısı kontrol edilir.

Sunucu ID’si tercihen panelden ayarlanır. `DATHOST_SERVER_ID` ortam değişkeni de desteklenir; tanımlıysa paneldeki değerin önüne geçer. `PUBLIC_ORIGIN`, `ADMIN_PASSWORD` ve `MATCHZY_WEBHOOK_SECRET` önceki kurulumdaki gibi gerekir. Webhook Secret en az 24 karakter olmalı; boşluk, tırnak, `;` veya `\` içermemeli.

**Variables cannot be added to a Worker that only has static assets** görürsen yayın yalnızca statik dosyaları içeriyordur. [Workers rehberindeki](WORKERS.md#1-workers-yayın-komutunu-değiştir) deploy komutunu düzelt.

Resmi kaynaklar: [DatHost API](https://dathost.net/api), [Console endpoint](https://dathost.readme.io/reference/post_game_server_console), [MatchZy maç kurulumu](https://shobhit-pathak.github.io/MatchZy/match_setup/).

### Organizatör iletişimini yayınlama

**Yönetim → Turnuva & API** içinde **Organizatör / yetkili adı** ve **Organizatöre ulaşma yolu** alanlarını doldur, ardından **Değişiklikleri kaydet** düğmesine bas. Okuldaki başvuru noktası, gerçek e-posta veya Discord iletişimi yazabilirsin. Bu bilgiler **Kurallar** sayfasında herkese görünür. Boş bırakılan iletişim yolu yayınlanmış gibi gösterilmez. Bu alanlar için yeni SQL dosyası gerekmez.

### Minimal görünüm ve aktif maç

**Yönetim → Turnuva & API → Site görünümü** bölümünde **Minimal görünüm** seçimini aç. **Ana sayfadaki aktif maç** listesinden tek bir maç seç veya **Aktif maç yok · Yalnızca braketler** seçeneğini kullan. Sabit çubuktan **Değişiklikleri kaydet** düğmesine bas. Seçilen maçın yerini yeni seçimin alır; aynı anda iki aktif maç gösterilmez. Bu seçim oyun sunucusunu başlatmaz.

Minimal görünümde yalnızca seçili maç ve alt alta kazananlar/kaybedenler braketleri ile final görünür. Maç seçilmemişse veya seçili maç sonuçlanmışsa boş maç kartı gösterilmez; doğrudan braketler açılır. **Minimal görünüm** seçimini kapatıp kaydederek ayrıntılı görünüme dönülebilir. Ek SQL dosyası gerekmez.

### Steam hesabı

Sol üstteki hesap menüsü giriş yapmadan **Misafir** gösterir. Steam ile girişte hesap adı ve fotoğrafı Steam’in herkese açık profilinden alınır; profil geçici olarak alınamazsa kimlik doğrulaması ve maç yetkileri korunur. **Hesap ayarları** üzerinden profil bilgisi yenilenebilir, Steam profili açılabilir ve oturum kapatılabilir. Turnuva kadrosundaki oyuncu adı Steam profilinden ayrı kalır; kadro değişikliklerini admin yapar.

## 3. Maç ayarları

**Yönetim → Maç yönetimi → ilgili maç → Ayarlar** bölümünden yer/sunucu etiketini ve oyunculara maç notunu düzenleyebilirsin. Sabit kayıt çubuğundan **Değişiklikleri kaydet** düğmesine bas.

Tarih, saat ve planlanan süre belirleme kaldırıldı. Eski kayıtlardaki takvim bilgileri kullanılmaz. Maç sırası eşleşmelere ve sonuçlara göre ilerler; ana sayfadaki aktif maçı **Turnuva & API → Site görünümü** bölümünden admin seçer.

## 4. Maçı tek düğmeyle sunucuya yükle

### İlk turdaki rakipleri seçme

1. **Yönetim → Maç yönetimi** sekmesini aç. Sayfanın üstündeki **İlk tur eşleşmeleri** bölümünü bul.
2. U1, U2, U3 ve U4 için **Birinci takım** ve **İkinci takım** listelerinden istediğin rakipleri seç. Seçilen takım başka maçtaysa iki takım yer değiştirir; aynı takım iki maçta görünmez.
3. Sabit kayıt çubuğundaki **Değişiklikleri kaydet** düğmesine bas. Turnuva ağacı ve MatchZy dosyası bu eşleşmeleri kullanır; sonraki turlar sonuçlara göre otomatik oluşur.
4. Hazırlık veya maç sonucu varsa tüm turnuvanın sonuç/hazır/veto kayıtlarını sıfırlama onayı istenir. Devam etmek istemiyorsan **Vazgeç → Kaydı yeniden yükle** ile eski eşleşmelere dön. Sunucuda maç oynanıyorsa önce onu durdur; eşleşme kaydetmek sunucudaki oyunu bitirmez.

Bu eşleşme düzenlemesi için ek SQL dosyası gerekmez.

### Sunucuya yükleme

1. Kadroları kaydet ve gerçek vetoyu tamamla. Prova vetosu gerçek sunucuya yüklenemez.
2. **Yönetim → Maç yönetimi → ilgili maç → Sunucu** alt sekmesini aç. Veto işlemleri **Veto**, manuel sonuçlar **Skor** alt sekmesindedir. Seçili maçın üstündeki özet güncel aşamayı, eksikleri ve sıradaki işlemi gösterir.
3. **Maçı sunucuya yükle** düğmesine bas. Seçtiğin maçı kontrol et, ardından **Onayla ve uygula** de. Yükleme haritayı değiştirebilir.
4. “Komut DatHost’a iletildi” başarılı bir HTTP yanıtıdır. Maç aşaması önce **Sunucu onayı bekleniyor**, MatchZy `series_start` gönderince **Oyun içi hazırlık** olur.
5. Oyuncular **Sunucuya katıl** bağlantısıyla CS2’ye geçebilir. Olmazsa **Adresi kopyala** düğmesi `connect IP:port` komutunu verir; CS2 konsoluna yapıştır.
6. İki takım oyun sohbetine `.ready` yazar. Bıçak raundu ve taraf seçiminin ardından maç canlı olur.

Özel 1v1’de aynı kontroller odanın içinde görünür; takım başına bir kişi gerekir. Her oda için JSON dosyası yüklemen gerekmez. Site kısa ömürlü, bir kullanımlık bağlantı üretir; MatchZy dosyayı doğrudan alır. Webhook ayarları özel sunucu yanıtında iletilir. İndirilebilir normal maç JSON’u uzun ömürlü Secret içermez.

**Duraklat**, **Devam et**, **Sunucudaki maçı bitir** kontrolleri de onay ister. Sayfadaki durum MatchZy olayından doğrulanır. Aynı sunucuda iki farklı maçın yüklenmesi engellenir. Bağlantı zaman aşımında komutun çalışıp çalışmadığı belirsiz kalabilir; düğmeye tekrar tekrar basma. DatHost konsolunu kontrol et. Sunucuyu oradan kesin olarak bitirdiysen **Sistem & Yedek → Takılı kalan sunucu kaydı → sunucu boş onayı → Sunucuyu boş olarak işaretle** ile sitedeki kaydı temizle.

## 5. Kadro, hükmen sonuç ve tekrar

- Kadro/SteamID/kaptan değişiklikleri gelecek maçlara uygulanır. Vetosu başlamış ve oynanmış maçlar kendi kadrosunu saklar. Bunlar tüm turnuvayı sıfırlamaz.
- Yeni kadro seçili, henüz yüklenmemiş maça da uygulanacaksa **Kurtarma işlemleri → Seçili maçın kadrosunu yenile** kullan. O maçın vetosu ve hazırları temizlenir.
- Takım ekleme/silme ve seri başı değişikliği ağacı değiştirir; başlamış turnuvada sıfırlama onayı gerekir.
- **Hükmen sonuç** bölümünden kazananı ve nedeni gir. BO1 13–0, BO3 2–0 olarak **hükmen** işaretlenir. Sahte harita veya oyuncu istatistiği oluşmaz. Sunucudaki maçı ayrıca bitir.
- **Yeni kimlikle tekrar oynat** önce sunucunun durdurulduğunu onaylatır. Eski maç kimliği ve istatistikler geçmiş/yedekte kalır; yeni deneme eski webhook’larla karışmaz. Etkilenen sonraki maçların hazırlıkları ve sonuçları temizlenir. Etkilenmeyen diğer maçlar korunur. İstersen seçili maçın vetosunu koruyabilirsin.

## 6. Raund backup’ından dönme

**Kurtarma işlemleri → Sunucudaki backup raundu** alanına MatchZy’deki mevcut haritanın backup numarasını gir ve **Sunucuda backup yükle** kullan. Site keyfi dosya yolu veya konsol komutu kabul etmez; MatchZy `css_restore` kullanılır. Komutun başarılı olduğunu `backup_loaded` olayı doğrular. BO3’te bu komut mevcut haritada çalışır.

Site geri yüklenen haritanın eski skorunu gizler. Sonraki ilk raundun toplam skoru `backup round_number + 1` olduğunda veri tekrar kabul edilir. Sonraki raundlar birer artmalıdır; eski büyük skorlu olaylar bu şekilde engellenir. `0`, ilk raundun öncesidir. Aynı backup olayı tekrar işlendiğinde skor tekrar temizlenmez.

MatchZy olaylarında benzersiz olay kimliği/zamanı bulunmadığından eksik veya tamamen aynı sayılara sahip eski olaylar kesin ayırt edilemez. Olay kaybında ya da aynı backup’ı yeniden yüklediğinde **Siteyi backup durumuna eşitle** ile gerçek harita sırasını ve geri dönülen raundu belirt. Bu kontrol sunucuya komut göndermez; sitenin veri bekleme noktasını düzeltir. Backup işlemleri admin geçmişine yazılır.

## 7. Tam yedekleme ve sonuçlar

**Sistem & Yedek → Tam yedeği indir**: takımlar, takvim, manuel sonuçlar, gerçek harita kayıtları, veto, maç kadroları ve özel 1v1 odaları dahildir. Hesap parolaları, webhook Secret, Steam doğrulamaları ve oturumlar dahil değildir.

Geri yükleme için dosyayı seç. Önce şema, skorlar, veto sırası ve kimlikler doğrulanır; kayıt sayıları gösterilir. **Geri yüklemeyi hazırla** de, sunucudaki maçı durdurduğunu onayla, ardından **Yedeği geri yükle** düğmesine bas. Veriler D1 üzerinde tek atomik işlemle değişir; hata olursa mevcut kayıtlar korunur. Mevcut durum ayrıca sıkıştırılmış otomatik yedek olarak saklanır ve aynı panelden indirilebilir. Hazır işaretleri yeniden verilir; mevcut girişler ve Steam doğrulamaları korunur.

**Sonuçlar** menüsünde şampiyon, finalist, takım özeti ve oyuncu performansı görünür. Yalnızca tamamlanan turnuva maçları sayılır. Eksik istatistik kapsamı açıkça yazılır; eksik verilerle genel MVP ilan edilmez. Özel 1v1 ve hükmen sonuçlar oyuncu performansına katılmaz. **Davet bağlantısını kopyala** bağlantıları oda/vetoyu paylaşır; oyuncu Steam girişinden sonra davet edildiği sayfaya döner.

İlk girişte yükleniyor ekranı en az bir saniye kalır; güncel turnuva bilgileri alınmadan tarayıcıdaki eski prova bilgileri veya örnek takımlar gösterilmez. İlk bağlantı kurulamazsa **Yeniden dene** seçeneği çıkar. Site açıldıktan sonra API bağlantısı koparsa son alınan gerçek veri korunur ve uyarı eklenir. Örnek 9–7 skoru yalnızca adminin açıkça seçtiği **Turnuvayı dene** modunda görünür.
