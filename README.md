# LUKYY — Neo-brutalist anime index

Katalog anime berbahasa Indonesia dengan navigasi Terbaru, Ongoing, Tamat, dan Jadwal Rilis. **Nama/branding aplikasi: LUKYY.** Integrasi scraper tetap mengambil data dari endpoint sumber yang diminta (`https://v2.samehadaku.how/`); tautan detail/episode mengarah ke situs sumber. Aplikasi ini hanya menampilkan metadata dan poster publik, bukan meng-host atau menanamkan video.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:3000` (atau `/home`). Tidak ada environment variable wajib.

## Integrasi scraper

- `lib/scraper.js` mengambil halaman listing sumber dan mengubahnya menjadi JSON.
- Data halaman disimpan dalam cache proses selama 8 menit agar permintaan ke sumber tidak berlebihan.
- `public/fallback.json` merupakan snapshot metadata yang digunakan saat sumber tidak bisa diakses.
- `/api/image` hanya mem-proxy gambar dari domain sumber yang diizinkan; URL lain ditolak.
- Route tampilan: `/home`, `/ongoing`, `/tamat`, `/jadwal`.

## Deploy ke Vercel

Impor/unggah project ini ke Vercel. `vercel.json` mengatur folder statis `public/`, API functions di `api/`, dan rewrite route aplikasi. Tidak diperlukan API key.

## Catatan

Ikuti kebijakan sumber dan ketentuan pemilik konten. Scraper membatasi frekuensi permintaan dengan cache dan mengarahkan pengguna ke sumber untuk detail/episode.
