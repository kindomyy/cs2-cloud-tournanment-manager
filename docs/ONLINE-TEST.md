# Cloudflare üzerinde çevrimiçi deneme

Bu sürümü bir sunucu veya veritabanı kurmadan Cloudflare Pages'te deneyebilirsin.

Bu ZIP yalnızca arayüz ve kişisel deneme içindir. **Gerçek MatchZy istatistikleri için [Functions + D1 kurulumunu](MATCHZY.md) GitHub bağlantılı Pages projesinde yap.** Statik ZIP yüklemek API uç noktalarını yayınlamaz.

## Hazır paketi yükle

1. Hazırlanan `kampus-arena-test.zip` dosyasını bilgisayarına indir.
2. [Cloudflare Dashboard](https://dash.cloudflare.com/) hesabında **Workers & Pages** bölümünü aç.
3. **Create application → Pages → Upload assets / Drag and drop** yoluyla bir Pages projesi oluştur. Menü farklı görünürse Pages için **Direct Upload** seçeneğini ara. Worker oluşturma akışını seçme.
4. Projeye örneğin `kampus-arena-test` adını ver, ZIP dosyasını yükle ve **Deploy site** ile yayınla. Bu hazır paket için build komutu girmen gerekmez.
5. Cloudflare'ın verdiği `https://…pages.dev` adresini aç. Kişisel deneme için adresin sonuna `/#dene`, yönetim provası için `/#admin` ekle. Özel alan adı gerekmez.

Paketin kökünde `index.html` bulunur; dosyaları bir üst klasörün içine taşıma. ZIP yüklemesi yerine klasör istenirse arşivi açıp içindeki dosyaları yükle. Proje yeniden oluşturulmadan sonraki paketler aynı projenin **Create deployment / Upload assets** bölümünden yüklenebilir.

## İlk deneme

1. `/#dene` ekranında U2 maçını seç. Durumu **Tamamlandı**, skoru **13 : 7** yap ve kaydet.
2. U5'te NOVA–PARALLAX, L1'de ORBIT–VOID eşleşmelerini kontrol et. Ana sayfadaki turnuva ağacı da aynı bilgiyi gösterir.
3. U5'e canlı **1 : 0** harita skoru gir. Sonra U2 sonucunu **7 : 13** olarak düzelt. U5'in sonucunun temizleneceği uyarısını kontrol et; önce iptal edip sonra onaylamayı dene.
4. Sayfayı yenile. Sonuçların aynı tarayıcıda kaldığını kontrol et. **JSON yedeği indir** ile denemeni dışa aktarabilirsin.
5. **Sıfırdan başlat** ile turnuvayı baştan oyna. Açılış maçları BO1 raunt skorudur; diğer maçlar BO3 harita skorudur (**2 : 0** veya **2 : 1**).
6. İkinci final açıkken alt koldan gelen takım ilk finali kazanırsa **GF2** açılır. Şampiyon bu seri bittikten sonra belirlenir.

## Bu test sürümünün kayıt davranışı

- Sonuçlar aynı tarayıcıda, aynı site adresinde saklanır. Telefonda, başka tarayıcıda veya gizli sekmede ayrı bir deneme açılır. Çok cihazlı ortak canlı skor henüz yoktur.
- **Turnuvayı dene** herkese açık bir simülasyon ekranıdır; kendi tarayıcındaki denemeni düzenler. Gerçek turnuva yönetimi ve sunucuda parola kontrolü bir sonraki aşamadır.
- Tarayıcı verilerini temizlemek denemeyi siler. Yedek indirip başka cihazda **Yedekten yükle** ile taşıyabilirsin. Site adresi değişirse yeni adreste de yedeğini yüklemen gerekir.
- İki yenilgi kuralını korumak için ikinci final serisi varsayılan olarak açıktır. Kapatırsan büyük final tek seri olur; üst kol takımı bir yenilgiyle elenebilir.
- Harita listesi bir deneme havuzudur. Veto akışı ve gerçek maç takvimi henüz eklenmedi. Skorlar oyun sunucusundan otomatik alınmaz.

## Paketi yeniden üret

Depo dizininde:

```sh
npm ci
npm test
npm run test:e2e
npm run package:test
```

Tarayıcı testleri için önce `npx playwright install chromium` çalıştır. Paket `artifacts/kampus-arena-test.zip` olarak üretilir; kaynak kod, `node_modules` veya kişisel tarayıcı kaydı içermez.

Bu yönerge yayınlamayı senin hesabında yapman içindir. ZIP'in hazırlanması veya yerel tarayıcı kontrollerinin geçmesi, Cloudflare'a yayın yapıldığı anlamına gelmez. Adresi aldıktan sonra yukarıdaki ilk denemeyi o adreste de uygula.
