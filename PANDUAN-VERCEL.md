# Panduan: pasang Google Client ID + MongoDB di Vercel

Ringkas: **Client ID** dibuat di Google Cloud, **database** dibuat di MongoDB Atlas, lalu
keduanya dimasukkan ke **Environment Variables** di Vercel. Setelah itu **wajib redeploy**.

---

## 1. Bikin database MongoDB (Atlas, gratis)

1. Buka **https://www.mongodb.com/atlas/database** → *Sign up* (bisa pakai akun Google).
2. **Create a cluster** → pilih **M0 FREE** (Shared, 512 MB) → provider AWS/Google →
   region **Singapore (ap-southeast-1)** → tombol **Create**.
3. Menu kiri **Database Access** → **Add New Database User**:
   - Authentication: *Password*
   - Username: `kelasnime` · Password: klik *Autogenerate* lalu **simpan password-nya**
   - Database User Privileges: **Read and write to any database** → *Add User*
4. Menu kiri **Network Access** → **Add IP Address** → pilih **ALLOW ACCESS FROM ANYWHERE**
   (`0.0.0.0/0`) → *Confirm*.
   > Vercel memakai IP yang berubah-ubah, jadi tidak bisa di-whitelist satu per satu.
   > Aman selama username/password-nya kuat.
5. Menu **Database** → tombol **Connect** → **Drivers** → Driver *Node.js* → **copy** string-nya:

   ```
   mongodb+srv://kelasnime:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   ```

6. Ganti `<password>` (beserta tanda `<` `>`) dengan password langkah 3.
   **Kalau password mengandung karakter khusus, harus di-encode:**

   | Karakter | Ganti jadi | Contoh |
   |---|---|---|
   | `@` | `%40` | `p@ss` → `p%40ss` |
   | `:` | `%3A` | `a:b` → `a%3Ab` |
   | `/` | `%2F` | `a/b` → `a%2Fb` |
   | `?` | `%3F` | `a?b` → `a%3Fb` |
   | `#` | `%23` | `a#b` → `a%23b` |

   Hasil akhir (contoh):

   ```
   MONGODB_URI=mongodb+srv://kelasnime:p%40ssword123@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   ```

   > Saran: waktu bikin password, pakai tombol *Autogenerate* (huruf/angka saja) supaya
   > tidak perlu repot encoding.

7. Nama database tidak perlu ditulis di URL — aplikasinya punya variabel sendiri:
   `MONGODB_DB=kelasnime`.

---

## 2. Bikin Google OAuth Client ID

1. Buka **https://console.cloud.google.com** → pilih/ buat project, mis. `KelasNime`.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External** → *Create*
   - Isi *App name* (`KelasNime`), *User support email*, dan *Developer contact email* → **Save and Continue**
   - Scopes: kosongkan saja → **Save and Continue**
   - **Test users**: tambahkan email Google yang boleh login ( WAJIB selagi aplikasi masih *Testing*)
   - Kalau mau semua orang bisa login: tombol **Publish App** (aplikasi cuma minta nama &
     foto profil, jadi biasanya tidak perlu verifikasi Google).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `KelasNime Web`
   - **Authorized JavaScript origins** (tanpa garis miring di akhir):
     ```
     https://kelasnime.vercel.app
     http://localhost:3000
     ```
   - **Authorized redirect URIs** (isi sama seperti di atas):
     ```
     https://kelasnime.vercel.app
     http://localhost:3000
     ```
   - **Create** → copy **Client ID**-nya, bentuknya:
     ```
     1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
     ```

   > Ganti `kelasnime.vercel.app` dengan domain Vercel kamu yang sebenarnya
   > (bisa juga domain sendiri). Kalau domain tidak persis sama, Google menolak login
   > dengan pesan *The given origin is not allowed*.

---

## 3. Masukkan ke Vercel

### Cara A — lewat dashboard (paling mudah)

1. Buka **https://vercel.com/dashboard** → pilih project **kelasnime**.
2. **Settings → Environment Variables**.
3. Isi satu per satu (Key / Value), centang **Production**, **Preview**, dan **Development**:

   | Key | Value | Contoh |
   |---|---|---|
   | `GOOGLE_CLIENT_ID` | Client ID dari langkah 2 | `1234567890-abc….apps.googleusercontent.com` |
   | `MONGODB_URI` | string Atlas dari langkah 1 | `mongodb+srv://kelasnime:p%40ss@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority` |
   | `MONGODB_DB` | nama database | `kelasnime` |
   | `DEMO_LOGIN` | `0` supaya tombol mode demo hilang | `0` |

   (opsional)
   | `SAMEHADAKU_BASE` | `https://v2.samehadaku.how` |
   | `OTAKUDESU_BASE` | `https://otakudesu.blog` |

4. **Deployments** → buka deployment teratas → tombol **⋯** → **Redeploy**.
   > Environment variable hanya berlaku untuk deployment **baru**. Kalau tidak redeploy,
   > `/api/config` akan tetap menampilkan nilai lama.

### Cara B — lewat CLI

```bash
npm i -g vercel
vercel login
vercel link            # di dalam folder hasil ekstrak kelasnime-deploy.zip

vercel env add GOOGLE_CLIENT_ID production
# → tempel Client ID, Enter

vercel env add MONGODB_URI production
# → tempel string mongodb+srv://…, Enter

vercel env add MONGODB_DB production   # → kelasnime
vercel env add DEMO_LOGIN production   # → 0

vercel --prod          # deploy ulang
```

### Cara C — file `.env` untuk komputer sendiri

```bash
cp .env.example .env
# isi GOOGLE_CLIENT_ID, MONGODB_URI, MONGODB_DB
npm install
npm start              # http://localhost:3000
```

---

## 4. Cek apakah sudah masuk

Buka alamat ini di browser (ganti domain-nya):

| URL | Yang benar |
|---|---|
| `/api/config` | `{"ok":true,"googleClientId":"1234….apps.googleusercontent.com","backend":"mongodb","demo":false}` |
| `/api/me` | `{"ok":true,"user":null,"backend":"mongodb","google":true}` |
| `/api/leaderboard` | `{"ok":true,"items":[]}` (kosong dulu, normal) |

Lalu buka halaman **Profil**: tombol **"Lanjutkan dengan Google"** harus muncul. Setelah login,
header menampilkan nama + gelar + `Lvl. X` + bar EXP, dan menu **Clan** bisa dipakai.

---

## 5. Kalau bermasalah

| Gejala | Penyebab & solusi |
|---|---|
| `/api/config` masih `googleClientId:""` | Env belum tersimpan **atau** belum redeploy → Settings → Environment Variables → cek nilainya, lalu **Redeploy** |
| `/api/config` masih `backend:"file"` | `MONGODB_URI` salah/ gagal konek → cek log: Vercel → project → **Functions → Logs**, cari baris `[store] MongoDB gagal` |
| Login Google error *The given origin is not allowed…* | Domain di **Authorized JavaScript origins** tidak persis sama dengan URL browser (harus https, tanpa `/` di akhir) |
| Login Google bisa di-admin tapi teman tidak bisa | Aplikasi masih **Testing** → tambahkan email mereka di *Test users*, atau klik **Publish App** |
| Mongo `ETIMEDOUT` / `ECONNREFUSED` | **Network Access** di Atlas belum `0.0.0.0/0` |
| Mongo `MongoServerError: bad auth` | Username/password salah; bedakan **Database Access user** dengan akun login Atlas, dan encode karakter khusus di password |
| Data komentar hilang setelah beberapa jam | `MONGODB_URI` belum terbaca → serverless Vercel tidak bisa menulis berkas, jadi wajib MongoDB |
| Function lambat/timeout (`FUNCTION_INVOCATION_TIMEOUT`) | `vercel.json` sudah diset `maxDuration: 30`. Di plan Hobby batasnya 60 detik; kalau sering timeout saat scraping, pindah ke Render/Railway/VPS |
| Tombol "mode demo" masih muncul | Set `DEMO_LOGIN=0` lalu redeploy (otomatis hilang kalau `GOOGLE_CLIENT_ID` terisi) |

---

## 6. Catatan untuk Vercel (serverless)

- Filesystem Vercel **read-only** → tanpa `MONGODB_URI` semua data (komentar, akun, EXP, clan)
  hanya tersimpan di memori dan hilang saat *cold start*. **Pakai MongoDB supaya permanen.**
- Kalau koneksi MongoDB gagal, aplikasi **tidak crash**: otomatis balik ke mode memori/berkas
  (lognya: `[store] MongoDB gagal, fallback ke berkas`).
- `mongodb` dan `google-auth-library` ada di `optionalDependencies`, jadi instalasi tetap
  jalan walau npm gagal mengambil paket itu — tapi untuk fitur ini tetap harus terinstal
  (Vercel menginstalnya otomatis).
