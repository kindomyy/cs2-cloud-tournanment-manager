# Mevcut Workers adresinde Steam ve MatchZy kurulumu

Bu proje hem Pages Functions hem de Workers ile çalışabilir. Senin siten Workers üzerinde:

`https://cs2-tournanmentmanager.fierce-condor.workers.dev`

`/#admin` tarayıcıdaki sayfayı seçer; `PUBLIC_ORIGIN` ve webhook adresine eklenmez. Depodaki `server/worker.ts`, mevcut Steam/yönetim/skor API’lerini Workers’a bağlar. `wrangler.worker.jsonc` site dosyalarını ve API’yi birlikte yayınlar.

## 1. Workers yayın komutunu değiştir

Cloudflare → **Workers & Pages → cs2-tournanmentmanager → Settings → Build** bölümünde GitHub `main` dalını kullan:

| Alan           | Değer                   |
| -------------- | ----------------------- |
| Build command  | `npm run build`         |
| Deploy command | `npm run deploy:worker` |
| Root directory | Depo kökü               |

Sonra yeni deployment başlat. Deploy komutu `wrangler.worker.jsonc` dosyasını kullanmalı; yalnızca `dist` dosyalarını yayınlamak API’leri eklemez.

Yapılandırmadaki `DB` bağının UUID’si özellikle sabitlenmedi. Mevcut `DB` bağı varsa güncel Wrangler onu devralır. Yoksa kaynak sağlama adımı D1 oluşturabilir; deploy logunda oluşan veritabanını kontrol et. Manuel bağlaman gerekirse Worker’ın **Bindings → Add binding → D1 Database** bölümünde değişken adını **`DB`** yapıp kendi veritabanını seç. Mevcut turnuva veritabanın varsa onu kullan.

## 2. Veritabanı tablolarını oluştur

Worker’ın `DB` bağına ait veritabanını Cloudflare **D1** bölümünden aç. SQL konsolunda şu dosyaların içeriğini sırayla çalıştır:

1. [0001_matchzy.sql](../migrations/0001_matchzy.sql)
2. [0002_management.sql](../migrations/0002_management.sql)
3. [0003_private_duels.sql](../migrations/0003_private_duels.sql)
4. [0004_operations.sql](../migrations/0004_operations.sql)

Önceki dosyalar uygulanmışsa yalnızca yeni 0004 dosyası yeterlidir. [İki kişilik test rehberi](1V1.md) kullanım adımlarını açıklar.

Bu dosyalar `CREATE TABLE IF NOT EXISTS` kullanır; var olan tabloları silmez. Daha önce uygulanmışlarsa yeniden çalıştırmak kayıtları sıfırlamaz.

## 3. Worker ayarlarını ekle

**Worker → Settings → Variables and Secrets** bölümünde:

| Ad                       | Tür    | Değer                                                      |
| ------------------------ | ------ | ---------------------------------------------------------- |
| `PUBLIC_ORIGIN`          | Text   | `https://cs2-tournanmentmanager.fierce-condor.workers.dev` |
| `ADMIN_PASSWORD`         | Secret | Kendi belirlediğin en az 12 karakterlik parola             |
| `MATCHZY_WEBHOOK_SECRET` | Secret | Kendin oluşturduğun en az 24 karakterlik rastgele değer    |

`PUBLIC_ORIGIN` dosyada da tanımlıdır. Gizli değerler kaynak koda veya sohbete yazılmaz. Değişiklikleri uygula ve gerekirse yeniden deploy et.

## 4. Steam girişini doğrula

Önce [yönetim API’sini](https://cs2-tournanmentmanager.fierce-condor.workers.dev/api/arena) aç:

- **JSON ve `steamConfigured: true`:** yönetim şeması ve site adresi hazır.
- **503 / D1 uyarısı:** `DB` bağını ve iki SQL dosyasını kontrol et.
- **HTML veya sitenin ana sayfası:** yayın hâlâ yalnızca statik dosyaları sunuyor; ilk adımdaki deploy komutunu kontrol et.

`/#admin` üzerinden kendi parolanla giriş yap. Gerçek SteamID64 kadrolarını ve kaptanları kaydet. Ardından `/#oyuncu` üzerinden **Steam ile doğrula** düğmesine bas. Steam’e gidip aynı siteye dönmelisin. Giriş için Steam Web API anahtarı gerekmez; hesap sahipliği OpenID ile doğrulanır. VAC/oyun sahipliği sorgusu bu akışa dahil değildir.

## 5. DatHost’taki MatchZy’yi bu adrese bağla

DatHost dosya yöneticisinde `game/csgo/cfg/MatchZy/config_override.cfg` dosyasına ekle. `BURAYA_AYNI_GIZLI_DEGER` yerine Worker’daki `MATCHZY_WEBHOOK_SECRET` değerini yalnızca sunucuda yaz:

```text
matchzy_remote_log_url "https://cs2-tournanmentmanager.fierce-condor.workers.dev/api/webhooks/matchzy"
matchzy_remote_log_header_key "Authorization"
matchzy_remote_log_header_value "Bearer BURAYA_AYNI_GIZLI_DEGER"
matchzy_ready_mode 0
matchzy_time_to_start 0
```

Var olan override dosyan varsa bu ayarları ona ekle. Güncel MatchZy override dosyasını eklenti yüklenirken çalıştırır. Sunucuyu yeniden başlat; `css_plugins list` çıktısında MatchZy görünmeli. Kurulu eski sürüm override dosyasını desteklemiyorsa o sürümün kendi yapılandırma dosyasını kullan. İlk üç satırı sunucu konsolunda uygulamak mevcut oturum için ayarı yapar; kalıcılık için dosya gerekir.

Gerçek veto bitince admin panelindeki ilgili maçı seç. Örneğin **U1** için DatHost sunucu konsolunda:

```text
matchzy_loadmatch_url "https://cs2-tournanmentmanager.fierce-condor.workers.dev/api/match-config?match=U1" "Authorization" "Bearer BURAYA_AYNI_GIZLI_DEGER"
```

Bu komut maçı/haritayı yapılandırır; oynanan bir maçın ortasında çalıştırma. Ardından 10 oyuncu oyun içinde `.ready` yazar. Sitedeki hazır durumu veto içindir; oyun içi hazırlık ayrıca yapılır.

İlk raunttan sonra [skor API’sinde](https://cs2-tournanmentmanager.fierce-condor.workers.dev/api/matches) maç görünmeli. Site yaklaşık 5 saniyede bir güncellenir. D1 ve şema hazırken henüz maç gelmemişse `configured: true, matches: []` normaldir.

DatHost REST hesabı istatistik alımı için gerekmez. Panelden **Maçı sunucuya yükle** kontrolü için `DATHOST_EMAIL` ve `DATHOST_PASSWORD` Secret’larını tanımla; sunucu ID’sini panelden kaydet. [Operasyon rehberi](OPERATIONS.md) her düğmeyi açıklar. Bu entegrasyon JSON’u otomatik iletir; yukarıdaki konsol komutu manuel alternatif olarak kalır.

## Yerel doğrulama

```sh
npm ci
npm run build
npm run build:worker
npx wrangler d1 migrations apply DB --local --config wrangler.worker.jsonc
npm run dev:worker
```

Bu komutlar yerel D1 kullanır; canlı turnuvayı değiştirmez. Yerelde yönetici girişini test etmek için git dışında tutulan `.dev.vars` dosyasında test parolanı ve yerel adres için `PUBLIC_ORIGIN="http://localhost:8787"` tanımla. Gerçek Steam dönüşü ayrıca yayınlanan HTTPS adresinde doğrulanmalıdır.
