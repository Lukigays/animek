# KelasNime — Nonton Anime Sub Indo

Aplikasi web mobile-first (tampilan ala KelasNime) yang menggabungkan:

| Kebutuhan | Sumber |
|---|---|
| **Metadata** (poster, sinopsis, skor, studio, jadwal, genre) | **Jikan API v4** (MyAnimeList) — dengan **cadangan otomatis AniList GraphQL** kalau MAL/Jikan lagi down |
| **Anime / streaming** | Samehadaku (`src/sources/samehadaku.js`) + Otakudesu (`src/sources/otakudesu.js`); URL sumber disimpan server-side |

> Samehadaku ditambahkan sebagai sumber anime kedua. Backend menggabungkan hasil pencarian/rilisan dari kedua sumber dan menyimpan URL asli di server. Beranda memakai susunan katalog ala referensi DansNime, dengan skin neobrutalism buatan sendiri.

## Jalanin

```bash
cd kelasnime
npm install
npm start          # http://localhost:3000
```

Mau di-deploy? Baca **[DEPLOY.md](DEPLOY.md)** — tinggal upload: Vercel, Netlify, Render,
Railway, Fly.io, Koyeb, Docker, atau VPS. Sudah termasuk `vercel.json`, `netlify.toml`,
`Procfile`, `Dockerfile`, `render.yaml`, `fly.toml`.

**Langkah demi langkah memasang Google Client ID & MongoDB di Vercel** ada di
**[PANDUAN-VERCEL.md](PANDUAN-VERCEL.md)** (bikin cluster Atlas gratis, bikin OAuth Client,
isi Environment Variables, lalu redeploy).

Buat file ZIP siap upload: `npm run zip`.

Buka `http://localhost:3000`. Untuk akses dari HP, jalankan dengan `PORT=3000 npm start`
dan buka `http://<ip-laptop>:3000`.

## Fitur

- **Daftar episode lengkap 1 → tamat** di halaman detail: nomor urut, badge status **Tamat / Ongoing**,
  judul `Episode (1180)` untuk seri panjang seperti One Piece, **grup 50 episode**
  (`Semua | 1131 - 1180 | 1081 - 1130 | …`) supaya tidak menumpuk 1000+ kartu,
  filter nomor, tombol urut (1 → akhir / akhir → 1), progress "x/y ditonton",
  dan centang hijau untuk episode yang sudah ditonton (tersimpan di perangkat).
  Nomor episode dibersihkan otomatis: episode dobel dibuang, nomor tidak masuk akal
  (sumber salah ketik, mis. `…episode-2800` padahal "Episode 280") dikoreksi dari judulnya
- **Komentar per episode** (bukan per judul): tiap episode punya ruang diskusi sendiri,
  bisa dipilih lewat dropdown episode di halaman detail, dan otomatis tampil di halaman nonton
- **Login sekali, tetap masuk**: token sesi ditandatangani (HMAC) dan disimpan di perangkat,
  jadi refresh halaman, restart server, atau cold start Vercel **tidak** membuatmu login ulang
  (atur `SESSION_SECRET` kalau mau kunci sendiri)
- **Tanpa link/embed YouTube** — tidak ada trailer YT di halaman manapun
- **Murni streaming anime** — tidak ada menu/label TV siaran langsung; tipe "TV" dari metadata
  otomatis ditulis **"Seri"**, dan halaman detail menampilkan badge **Tamat / Ongoing**,
  skor, tahun, jumlah episode, serta **"N kali diputar"**
- **Anime Terkait** di halaman detail: sequel/prequel/side story ditampilkan sebagai kartu
  dengan badge **S2**, **Prekuel**, **Eps 12**, dll (mirip aplikasi referensi)
- **Komentar**: kirim komentar (nama + isi), suka komentar, hapus komentar sendiri,
  avatar warna-warni, waktu relatif ("2 jam lalu"), dan catatan aturan komunitas
- **Login Google (opsional)**: tombol *Lanjutkan dengan Google* di halaman Profil memakai
  Google Identity Services; ID token diverifikasi di server (`google-auth-library`), lalu
  server mengeluarkan token sesi sendiri. Tanpa `GOOGLE_CLIENT_ID` aplikasi tetap jalan
  (mode tamu, atau tombol *mode demo* untuk mencoba level & clan)
- **Level & EXP ala Wibuku**: nonton +15, komentar +8, balas +5, suka +2, bagikan +5,
  check-in harian +25 (naik terus sampai +60), buat clan +30. Header menampilkan avatar,
  nama, **gelar**, `Lvl. X`, dan bar EXP; beranda punya panel **Peringkat** (top 10 EXP,
  medali 🥇🥈🥉, gelar, dan tag clan)
- **Gelar & bingkai avatar** (bukan hewan peliharaan): gelar naik otomatis mengikuti level —
  Pemula → Otak-otak → Wibu Pemula → Ksatria Nime → Veteran → Dewa Nime → Legenda →
  Kaisar Nime. Bingkai avatar ikut berubah: Biasa, Perunggu, Perak, Emas, Platinum, Epik,
  Legendaris (berdenyut). Bingkai & gelar tampil di header, profil, papan peringkat,
  anggota clan, dan lencana `Lvl. X` di samping nama komentator
- **Check-in harian (streak 7 hari)**: kartu di halaman Profil dengan 7 kotak hari,
  EXP bonus makin besar tiap hari berturut-turut (`20 + 5×hari`, maks 60)
- **Clan**: buat clan (nama + tag 3–5 huruf), gabung / keluar, maksimal 30 anggota,
  halaman `#/clan` berisi hero clan, daftar anggota, dan daftar semua clan
- **Moderasi sederhana**: link dipotong jadi `[tautan dihapus]`, kata kasar disensor
  (`anjing` → `a*****`), huruf kapital berlebih dirapikan, karakter berulang
  (`anjaaakkkk`) dipadatkan, komentar <3 huruf dan duplikat ditolak, dan 3 laporan
  membuat komentar (plus balasannya) otomatis disembunyikan
- **Balas komentar (nested)**: tombol *Balas* di tiap komentar, balasan tampil menjorok
  sampai 3 level, dan komentar yang disembunyikan tetap bisa dibuka balasannya
- **Tombol lapor**: ⚑ *Lapor* per komentar (1 laporan per perangkat) — setelah 3 laporan
  komentar otomatis disembunyikan dan diganti "Komentar disembunyikan karena banyak laporan"
- **Halaman Profil** (pill akun di pojok kanan atas): akun Google / demo / tamu, statistik
  (komentar · disukai · episode ditonton · judul), dan 3 tab — **Komentar saya**,
  **Disukai**, **Riwayat tonton** — yang bisa diklik untuk balik ke halamannya
- **Kontrol pemutar lengkap** (untuk server langsung/mp4/hls): putar/jeda, **skip −10s / +10s**,
  progress bar yang bisa di-drag, pengatur kecepatan (0.75x–2x), layar penuh,
  **gestur double-tap kiri/kanan = ±10 detik**, dan pintasan keyboard (spasi, ←/→, F, M)
- **Tombol aksi di halaman nonton**: ❤️ **Suka** (dihitung server), 🔗 **Bagikan**
  (native share / salin tautan), **Autoplay ON/OFF** (lanjut episode berikutnya otomatis),
  dan hitung **"N kali diputar"**
- **Beranda katalog minimal** — tab `Terbaru · Ongoing · Tamat · Jadwal Rilis`, judul `Rilis Terbaru`, lalu grid poster 16 judul per halaman. Tidak menampilkan Global Chat, TOP NAKAMA, kartu akun/misi, rekomendasi, atau bagian sosial.
- **Skin neobrutalism** — kertas terang berpola titik, garis tebal hitam, aksen warna cerah dan bayangan keras; susunan katalog terinspirasi DansNime tanpa memakai aset/stylesheet-nya.
- **Navigasi bawah**: `Home · Jadwal Tayang · Riwayat · Subscribe · Profil`.
- Pencarian: hasil yang **bisa distreaming** dipisah dari hasil **info saja** (metadata)
- Detail anime: gabungan data sumber + Jikan/AniList (skor, studio, sinopsis, status), daftar episode lengkap
- Nonton: pemutar dengan **banyak server anonim** (`Server 1`, `Server 2 · 720p`, …), indikator
  hidup/mati, auto-pindah server kalau gagal, prev/next episode, muat ulang pemutar
- Jadwal rilis harian, genre, movie, rilisan terbaru
- **Sumber disembunyikan (white-label)**: tidak ada nama/URL sumber di UI, di URL, maupun di
  response API — semua tautan asli disembunyikan di balik **token acak**
- **Rotasi sumber acak**: mirror dan sumber dipilih acak tiap request (plus jeda acak & rotasi
  User-Agent) supaya beban terbagi dan tidak kelihatan seperti bot; kalau satu sumber gagal,
  otomatis pindah ke sumber lain
- **Real-time**: cache rilisan terbaru cuma ±90 detik, pencarian 5 menit

## Struktur

```
app.js                    aplikasi Express (tanpa listen) — dipakai semua entry point
server.js                 entry standalone: node server.js
api/index.js              entry Vercel serverless
netlify/functions/api.js  entry Netlify Functions (serverless-http)
vercel.json netlify.toml Procfile Dockerfile render.yaml fly.toml  konfigurasi deploy
server.js                 Express: API + static frontend
src/http.js               fetch + retry + deteksi anti-bot + fallback ke curl
src/cache.js              cache TTL di memori + de-duplikasi request
src/jikan.js              client Jikan (antrean 420ms, cache)
src/anilist.js            cadangan metadata via GraphQL AniList
src/meta.js               lapisan metadata terpadu + circuit breaker Jikan
src/sources/samehadaku.js scraper Samehadaku (list, search, detail, server)
src/sources/otakudesu.js scraper Otakudesu (list, search, detail, episode, server)
src/sources/kusonime.js   pencarian arsip unduhan (khusus endpoint unduh)
public/neo.css            tema neobrutalism + grid katalog
src/store.js              penyimpanan: MongoDB (kalau MONGODB_URI) atau memori + data/store.json
src/level.js              kurva level & EXP, gelar, bingkai avatar, bonus check-in
src/moderation.js         sensor kata kasar, potong link, tolak duplikat & spam
public/                   frontend (index.html, style.css, app.js, vendor/hls.min.js)
test/smoke.js             uji render tiap view pakai jsdom
```

## Endpoint API

| Endpoint | Keterangan |
|---|---|
| `GET /api/status` | mirror aktif & jumlah cache |
| `GET /api/latest?page=1` | katalog terbaru gabungan sumber |
| `GET /api/catalog?status=ongoing&page=1` | katalog ongoing |
| `GET /api/catalog?status=complete&page=1` | katalog tamat |
| `GET /api/latest?page=1` | rilisan terbaru gabungan Samehadaku + Otakudesu |
| `GET /api/catalog?status=complete&page=1` | katalog anime tamat Samehadaku |
| `GET /api/search?q=frieren` | cari di kedua sumber + `info` metadata anime |
| `GET /api/anime?slug=...` | detail/episode dari sumber yang punya daftar terlengkap |
| `GET /api/anime?source=jikan&id=mal52991` | detail metadata saja (`mal<id>` atau `al<id>`) |
| `GET /api/episode?url=<url-episode>` | daftar server video + link unduhan |
| `GET /api/proxy?url=...&ref=...` | proxy stream (dukung Range) untuk mp4/m3u8 |
| `GET /api/img?url=...` | proxy/cache gambar |
| `GET /api/meta/top?type=airing\|movie\|tv` | top anime |
| `GET /api/meta/search?q=...` | cari metadata |
| `GET /api/meta/anime/:id` | detail metadata (`mal123` / `al456`) |
| `GET /api/meta/schedule?day=monday` | jadwal rilis |
| `GET /api/meta/genres` / `GET /api/meta/genre/:id` | genre |

## Catatan teknis: menyembunyikan sumber

Browser tidak pernah menerima URL asli. Yang dikirim ke frontend cuma token acak:

| Endpoint | Isi |
|---|---|
| `/api/poster?p=<token>` | gambar poster/thumbnail (di-proxy + di-cache) |
| `/api/episode?e=<token>` | daftar server: `{n, label, type, alive}` — tanpa URL |
| `/api/embed?e=<token>&n=<no>` | halaman pemutar (dipanggil lewat iframe) — URL asli hanya ada di sini, di dalam server |
| `/api/stream?e=<token>&n=<no>` | proxy byte stream (dukung `Range`) untuk mp4/hls |

### Endpoint sosial, akun, level, clan

| Endpoint | Keterangan |
|---|---|
| `GET /api/config` | `googleClientId`, `backend` (`mongodb`/`file`), `demo` |
| `POST /api/auth/google` | tukar ID token Google → token sesi |
| `POST /api/auth/demo` | login demo (hanya aktif saat Google belum dikonfigurasi) |
| `GET /api/me` | profil + level + clan (`Authorization: Bearer <token>`) |
| `POST /api/me/exp` | tambah EXP (`{amount, reason}`) |
| `POST /api/me/checkin` | check-in harian → `{streak, reward, user}` (EXP naik tiap hari) |
| `GET/POST /api/comments?key=` | komentar + balasan (`parentId`), sudah lewat moderasi |
| `POST /api/comment-like`, `POST /api/comment-report` | suka / lapor (3 laporan → sembunyi) |
| `GET/POST /api/like?key=`, `GET/POST /api/view?key=` | suka & hitung putar |
| `GET /api/views?slug=` | total putar semua episode satu judul (untuk badge di detail) |
| `GET /api/clans`, `GET /api/clan/:tag` | daftar clan & detail + anggota |
| `POST /api/clan`, `POST /api/clan/join`, `POST /api/clan/leave` | kelola clan (perlu login) |

**Penyimpanan** (`src/store.js`) punya dua mode, tanpa konfigurasi wajib:

| Kondisi | Backend |
|---|---|
| `MONGODB_URI` **diisi** | MongoDB — koleksi `comments`, `users`, `clans`, `counters`, `moderation` |
| `MONGODB_URI` **kosong** (default) | memori + berkas `data/store.json` |

Kalau koneksi MongoDB gagal, server **otomatis jatuh ke mode berkas** (log
`[store] MongoDB gagal, fallback ke berkas`) — aplikasi tetap hidup. Di Vercel/Netlify
(filesystem read-only) mode berkas menjadi memory-only, dan browser tetap menyimpan
salinan komentar kiriman sendiri.

```bash
MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net" MONGODB_DB=kelasnime npm start
GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com" npm start   # aktifkan tombol Google
```

Profil tamu (nama, komentar kiriman, yang disukai, riwayat tonton) tetap tersimpan di
browser; yang tersimpan di server hanya akun (sub Google, nama, foto, EXP, clan) dan
komentar.

Nama server juga dinormalisasi (`Blogspot 360p` → `Server 1 · 360p`), dan teks yang kebawa
brand sumber (mis. di sinopsis) dibersihkan otomatis sebelum dikirim.

## Catatan teknis

- **Anti-bot**: beberapa halaman (terutama pencarian) memblokir fingerprint TLS Node/undici.
  `src/http.js` otomatis mengulang pakai `curl` kalau responsnya halaman challenge Cloudflare.
- **Sumber anime**: Samehadaku (`SAMEHADAKU_BASE`) + Otakudesu (`OTAKUDESU_BASE`) mengisi katalog, pencarian, detail, dan server; hasil rilisan/pencarian digabung dan dideduplikasi. Arsip unduhan tetap terpisah untuk menjaga fitur Unduh.
- **Tampilan katalog**: susunan navigasi kategori dan grid rilisan mengikuti pola DansNime; tampilannya memakai skin neobrutalism KelasNime (bingkai hitam tebal, warna cerah, dan hard shadow), bukan menyalin aset atau stylesheet situs referensi.
- **Server video**: hasil `player_ajax` bisa berupa `<iframe src>`, `<script src>` (pemutar JS),
  atau shortcode `[drama id=...]` (diubah jadi URL Blogger). Semuanya dinormalisasi jadi
  `{name, url, type}` dengan `type = hls | mp4 | embed | script`.
- **Rate limit Jikan**: semua request ke Jikan di-antre (≈2 req/detik) dan di-cache.
  Kalau Jikan error 2× berturut-turut pada satu kelompok endpoint (`top`, `search`,
  `detail`, `schedule`, `genre`), aplikasi beralih ke AniList selama 2 menit untuk
  kelompok itu saja — jadi kalau cuma `/top` yang down, detail anime tetap pakai MAL.
- **Cek server video**: sebelum daftar server dikirim ke browser, tiap URL di-probe
  (5 detik, di-cache 15 menit). Yang merespon ditaruh di atas (hijau), yang mati di
  bawah (merah), yang tidak bisa dicek dari server kuning. Pemutar juga otomatis pindah
  ke server berikutnya kalau video gagal dimuat.
- **Pemutar**: server `mp4/hls` diputar langsung (`<video>` + hls.js, ada proxy
  `/api/proxy` untuk lewatin CORS/Referer), server `embed/script` dirender di iframe.

## Tes (opsional)

```bash
npm i -D jsdom puppeteer
node test/smoke.js    # render tiap view, cek error JS
node test/flow.js     # klik: home -> detail -> episode -> ganti server
node test/audit.js    # cek overflow, gambar rusak, request gagal
```

## Legal

Proyek ini hanya agregator link yang sudah dipublikasikan situs lain. Tidak ada berkas video
yang disimpan di server ini. Gunakan sesuai hukum yang berlaku di negara kamu.

## Tampilan

- **Tema glassmorphism** (`public/glass.css`): seluruh antarmuka memakai panel kaca buram
  (`backdrop-filter: blur()`), latar gradien bercahaya yang bergerak pelan, sudut membulat,
  serta bayangan lembut — berlaku untuk kartu, navigasi atas & bawah (mengambang),
  komentar, daftar episode, chip, tombol, dan pemutar.

## Catatan teknis

- **Token episode tidak pernah kedaluwarsa.** Dulu token disimpan di memori 12 jam,
  sehingga muncul error “Episode tidak valid/kedaluwarsa” (lewat 12 jam, restart server,
  atau cold start Vercel). Sekarang token berisi data terenkripsi (AES-256-GCM) sehingga
  berlaku selamanya dan alamat sumber tetap tersembunyi. Tambahan: kalau sebuah token
  rusak, server mencari ulang episode dari `slug` + nomor episode, jadi tautan lama
  tetap bisa diputar.

## Pembaruan terakhir

- **Scraper baru: Kusonime** (`src/sources/kusonime.js`) — sumber tambahan khusus
  **link unduhan** anime (Google Drive, Pixeldrain, Acefile, Terabox, Mega, dan lain-lain),
  lengkap dengan pilihan kualitas. Sumber streaming utama hanya punya link embed,
  jadi berkas unduhan diambil dari sini.
- **Fitur unduh**: tombol **⬇ Unduh** di halaman nonton dan halaman detail membuka panel
  kaca berisi kualitas & host. Host yang bisa diunduh langsung (Google Drive, Pixeldrain)
  lewat proxy `/api/dl` dengan header `Content-Disposition: attachment` dan dukungan
  *range* (lanjut/jeda unduhan); host lain membuka situs penyedia di tab baru.
- **Murni anime**: manga, manhwa, novel, one-shot, dan doujin otomatis dibuang dari
  hasil pencarian (filter `animeOnly()` di server).
- **Tema glassmorphism** (`public/glass.css`): seluruh antarmuka memakai panel kaca buram
  (`backdrop-filter`), latar gradien bercahaya yang bergerak, navigasi bawah mengambang,
  sudut membulat, bayangan lembut — termasuk panel unduhan, komentar, dan pemutar.

## Fitur tambahan dan aturan komentar

- **Sumber katalog**: rilisan dan pencarian dikumpulkan dari Samehadaku + Otakudesu, sedangkan detail anime memakai sumber dengan daftar episode paling lengkap. Metadata tetap lewat Jikan/AniList; arsip unduhan batch tetap terpisah.
- **Unduhan per episode**: panel unduhan menampilkan **“Episode N · MP4”** di urutan pertama
  (lewat `/api/dlmp4`, nama berkas otomatis, mendukung *range*), disusul link batch dari Kusonime.
- **Level & klaim harian diperbaiki**: setelah klaim, tombol langsung berubah jadi
  “✓ Hari ini” (nonaktif), EXP/header/kartu akun/peringkat diperbarui seketika, dan ada
  ucapan **naik level** (“LEVEL 2! …”) saat level bertambah.
- **Aturan komentar**:
  - **Harus login** untuk berkomentar (server menolak dengan `401` bila belum masuk);
    tamu melihat tombol “Masuk” dan kolom komentar dinonaktifkan.
  - **Nama komentar mengikuti akun Google** — tidak ada lagi kolom nama manual.
  - Komentar **hanya ada di tiap episode** (halaman nonton). Halaman detail anime tidak
    lagi menampilkan kolom komentar, hanya catatan untuk membuka episodenya.

## Alur seperti Wibuku & unduhan di halaman nonton

- **Tombol unduh dihapus** (di pemutar maupun halaman detail). Unduhan sekarang berupa
  **bagian tersendiri di halaman nonton** — tinggal gulir ke bawah, ada
  **“Unduh Episode N”** (berkas MP4 langsung ditandai ⬇) lalu **Komentar Episode N**.
  Komentar memang cuma ada per episode, dari episode 1 sampai episode terakhir.
- **Klik kartu anime → halaman detail**, bukan langsung memutar/pratinjau. Slug episode
  pada kartu rilisan otomatis dipotong jadi slug serinya, jadi yang terbuka adalah
  halaman animenya lengkap dengan daftar episode.
- **Halaman detail ala Wibuku**: poster + judul + status + sinopsis + genre, lalu
  **Anime Terkait** yang menampilkan musim lanjutan (badge **S2**, **S3**, Sekuel, dll),
  dan daftar episode lengkap dengan tanggal rilisnya.
- **Movie tidak lagi “Episode (0)”**: judul film/tanpa daftar episode otomatis dibuatkan
  1 episode dari halaman animenya.
- **Perbaikan kecil**: poster dengan URL tanpa skema tidak pernah menghasilkan error
  (diganti placeholder), dan proxy video/unduhan mengulang sekali bila host menolak.

## Navigasi & perilaku aplikasi

- **Beranda**: katalog sederhana ala DansNime—tanpa Global Chat, TOP NAKAMA, kartu akun/misi, maupun blok rekomendasi.
- **Tema neobrutalism**: bentuk tegas dan hard-shadow menggantikan kaca blur.
- **Lapisan cadangan**: hasil terakhir yang pernah berhasil disimpan; bila semua sumber
  sedang tumbang, data itulah yang dikirim (dengan catatan halus "menampilkan data
  terakhir") — tidak ada lagi layar kegagalan total.
- **Riwayat Menonton** dan **Subscribe** punya halaman sendiri. Subscribe tersimpan di
  perangkat dan ikut akun Google kalau sudah masuk (endpoint `/api/subs`).
- **UI tidak ngeleg**: efek kaca (backdrop-filter) dimatikan pada elemen yang diulang
  puluhan kali (kartu, chip, baris episode), `content-visibility` per bagian, dan gambar
  dimuat malas; kaca hanya dipertahankan di permukaan besar (nav, panel, pemutar).
