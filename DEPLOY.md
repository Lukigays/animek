# Panduan Deploy — KelasNime

Satu kode, bisa jalan di banyak host gratis. Semua konfigurasi sudah disiapkan:

| File | Untuk |
|---|---|
| `vercel.json` + `api/index.js` | **Vercel** (serverless) |
| `netlify.toml` + `netlify/functions/api.js` | **Netlify** (serverless) |
| `server.js` + `Procfile` | **Render, Railway, Koyeb, Heroku, VPS** |
| `Dockerfile` + `.dockerignore` | **Fly.io, Koyeb, Render (Docker), VPS** |
| `render.yaml` | Render Blueprint |
| `fly.toml` | Fly.io |
| `.env.example` | contoh environment variable |

Alur kerja: `app.js` berisi aplikasi Express (tanpa `listen`), lalu tiap host punya entry point sendiri:
`server.js` (standalone) · `api/index.js` (Vercel) · `netlify/functions/api.js` (Netlify).

---

## 1. Vercel (paling cepat, gratis)

### Lewat CLI

```bash
cd kelasnime
npm i -g vercel
vercel login
vercel deploy --prod       # atau: vercel --prod
```

### Lewat GitHub

1. Push folder ini ke repo GitHub.
2. Import project di [vercel.com/new](https://vercel.com/new).
3. **Framework Preset: Other** · **Root Directory: `./`** · Build command dikosongkan saja
   (Vercel akan `npm install` otomatis).
4. Klik Deploy.

`vercel.json` sudah mengatur:
- semua request (`/(.*)`) diteruskan ke fungsi `api/index.js`,
- `public/**` ikut dibundel (`includeFiles`) supaya frontend bisa disajikan,
- `maxDuration: 30` detik & memory 1 GB.

### Batasan Vercel Hobby (gratis)

- Fungsi maksimal **30 detik** (sudah di-set; cukup untuk scraping 1 halaman).
- Cache di memori **reset saat cold start** — wajar, data akan diambil ulang.
- Bandwidth 100 GB/bulan. Kebanyakan video diputar lewat iframe-host (Blogspot/Mega),
  jadi yang lewat server cuma metadata + proxy stream mp4/m3u8.
- Kalau nanti muncul error `FUNCTION_INVOCATION_TIMEOUT`, naikkan jadi 60 (butuh plan Pro).

### Data komentar / like / view

- Disimpan di memori + `data/store.json` kalau filesystem writable (VPS, Render dengan disk, Docker).
- Di **Vercel/Netlify** filesystem read-only → otomatis memory-only: data hilang saat cold start.
  Komentar yang dikirim pengunjung juga disimpan di browser masing-masing, jadi tidak hilang
  dari layar mereka.
- Balasan komentar (`parentId`) dan laporan (`reports`) ikut tersimpan di berkas yang sama.
  Profil pengunjung (nama, komentar saya, yang disukai) **hanya** di localStorage browser.
- Mau permanen di serverless tanpa MongoDB? Ganti penyimpanannya dengan Vercel KV /
  Upstash Redis — cukup ubah `src/store.js`.
- Dengan `MONGODB_URI`, akun/level/clan tersimpan permanen di database; kalau koneksi
  putus, server otomatis pakai berkas/memori (lihat log `[store] MongoDB gagal`).

## Environment variable (opsional)

Set di Vercel → Settings → Environment Variables:

```
SAMEHADAKU_BASE=https://v2.samehadaku.how
OTAKUDESU_BASE=https://otakudesu.blog
```

**Login Google & database (opsional, tapi disarankan):**

```
# 1) Login Google — buat di https://console.cloud.google.com/apis/credentials
#    Authorized JavaScript origins  : https://namadomain.com
#    Authorized redirect URIs       : https://namadomain.com
GOOGLE_CLIENT_ID=xxxxxxx.apps.googleusercontent.com

# 2) Database MongoDB — atlas.com (gratis 512 MB) atau mongodb lokal
#    Kosongkan saja kalau tidak punya: aplikasi otomatis pakai memori + data/store.json
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net
MONGODB_DB=kelasnime        # default: kelasnime

# 3) Matikan tombol "mode demo" kalau sudah ada Google (default: hidup saat Google kosong)
DEMO_LOGIN=0
```

Tanpa dua variabel itu aplikasi tetap berjalan penuh: komentar, suka, riwayat,
level & EXP tamu tersimpan di perangkat; cuma clan dan sinkronisasi antar-perangkat
yang butuh login.

---

## 2. Netlify (gratis)

```bash
# via CLI
npm i -g netlify-cli
netlify login
netlify init      # atau: netlify deploy --prod --build
```

Atau import dari Git di [app.netlify.com](https://app.netlify.com) — `netlify.toml` sudah
mengatur build (`npm install`), folder fungsi, publish `public/`, dan redirect:

- `/api/*` → Netlify Function (Express),
- `/*` → `index.html` (frontend SPA, hash routing).

Netlify Functions (AWS Lambda) juga punya batas **10 detik** di plan gratis —
kalau scraping sering timeout, pakai Render/Railway/VPS (opsi 3–5).

---

## 3. Render (gratis, tapi “tidur” kalau idle)

Opsi A — Blueprint (otomatis pakai `render.yaml`):

1. Push ke Git.
2. [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → pilih repo.

Opsi B — manual:

- **New → Web Service**
- Build Command: `npm install`
- Start Command: `node server.js`
- Plan: **Free**
- Health Check Path: `/api/status`

> Free tier Render tidur setelah ±15 menit tidak dipakai; request pertama butuh ~30–50 detik
> untuk bangun. Tidak masalah untuk pemakaian pribadi.

---

## 4. Railway

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

Railway mendeteksi `package.json` → jalanin `npm start` (`node server.js`).
Set variabel `PORT` dikosongkan saja (Railway inject otomatis).

---

## 5. Fly.io / Koyeb (Docker)

```bash
# Fly.io (sudah ada fly.toml, ganti nama app dulu)
fly apps create kelasnime-xxx     # lalu ubah baris app = "..." di fly.toml
fly deploy
```

Atau hosting Docker apa pun:

```bash
docker build -t kelasnime .
docker run -p 3000:3000 --env-file .env kelasnime
```

`Dockerfile` sudah menginstal `curl` (dibutuhkan sebagai fallback scraping).

---

## 6. VPS (Ubuntu + PM2 + Nginx)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs curl nginx
sudo npm i -g pm2

cd /var/www/kelasnime
npm install --omit=dev
cp .env.example .env

pm2 start server.js --name kelasnime
pm2 startup && pm2 save          # auto jalan saat reboot
```

Nginx (proxy ke port 3000):

```nginx
server {
  listen 80;
  server_name namadomain.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;          # penting buat streaming
    proxy_read_timeout 300s;
  }
}
```

Lalu `sudo certbot --nginx -d namadomain.com` untuk HTTPS gratis.

---

## Environment variable

> Panduan bergambar/langkah demi langkah untuk **Google Client ID + MongoDB Atlas di Vercel**
> ada di **[PANDUAN-VERCEL.md](PANDUAN-VERCEL.md)**.

| Nama | Default | Keterangan |
|---|---|---|
| `PORT` | `3000` | port server standalone |
| `SAMEHADAKU_BASE` | `https://v2.samehadaku.how` | base scraper Samehadaku |
| `OTAKUDESU_BASE` | `https://otakudesu.blog` | base scraper Otakudesu |
| `GOOGLE_CLIENT_ID` | *(kosong)* | Client ID Google OAuth (Web application). Kalau diisi, tombol *Lanjutkan dengan Google* muncul di Profil |
| `MONGODB_URI` | *(kosong)* | Koneksi MongoDB (`mongodb://` atau `mongodb+srv://`). Kalau kosong → memori + `data/store.json` |
| `MONGODB_DB` | `kelasnime` | Nama database MongoDB |
| `DEMO_LOGIN` | `1` | `0` = sembunyikan tombol login demo. Otomatis nonaktif kalau `GOOGLE_CLIENT_ID` diisi |

Yang tersimpan di database: akun (sub Google, nama, foto, **EXP, level, streak check-in,
clan**), komentar, clan, dan counter suka/tayang. Level, gelar, dan bingkai avatar
dihitung ulang dari EXP, jadi tidak perlu kolom tambahan.

---

## Troubleshooting

| Semua server video mati / banyak dot merah | Probe dilakukan dari server. Dot kuning = tidak bisa dicek dari server (bisa saja jalan di browser kamu). Tetap bisa diklik. |
| Tautan episode kedaluwarsa | Token episode disimpan di memori (12 jam). Di serverless, cold start mengosongkannya — frontend otomatis minta token baru lewat slug. |
| Episode yang ditonton hilang | Progres tersimpan di browser (localStorage), bukan di server. |

| Gejala | Penyebab & solusi |
|---|---|
| Halaman putih / 500 “Frontend tidak ditemukan” | Folder `public/` tidak ikut ter-deploy. Di Vercel pastikan `vercel.json` (includeFiles) terbaca; di Netlify pastikan `publish = "public"`. |
| `/api/home` lama atau error `BLOCKED` | Salah satu sumber membatasi permintaan; aplikasi akan beralih ke sumber lain. Periksa `SAMEHADAKU_BASE` dan `OTAKUDESU_BASE`. |
| Semua metadata dari AniList | Jikan/MAL lagi gangguan (404/504). Aplikasi otomatis pakai AniList; akan balik ke Jikan sendiri saat pulih. |
| Video tidak muncul | Ganti server di bawah pemutar (indikator hijau = merespon). Server embed butuh koneksi browser ke hostnya (Blogspot/Mega/Filedon). |
| Error saat scraping walau di lokal jalan | Host tidak punya binary `curl`. Di Docker sudah diinstal; di VPS `sudo apt install curl`. |

---

## Catatan

- Proxy stream (`/api/proxy`) akan memakan bandwidth server. Kalau dipasang di hosting
  gratis dengan kuota kecil dan dipakai ramai-ramai, siapkan mirror/upgrade plan.
- Proyek ini murni agregator link publik; tidak ada berkas video yang disimpan di server.
