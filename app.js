const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { Readable } = require('stream');
const { cache, TTLCache } = require('./src/cache');
const { UA } = require('./src/http');
const meta = require('./src/meta');
const otakudesu = require('./src/sources/otakudesu');
const samehadaku = require('./src/sources/samehadaku');
const kusonime = require('./src/sources/kusonime');

const app = express();
// Penanda rilis: dipakai untuk memastikan berkas frontend (app.js/glass.css)
// tidak tersangkut di cache browser/Vercel setelah deploy baru.
const BUILD = process.env.BUILD_ID || 'r11-2026-10-18';
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

/* ------------------------- folder frontend & .env ------------------------- */

// Cari folder frontend. Lokasinya bisa beda tergantung cara deploy
// (lokal / VPS / Docker / Vercel serverless).
function findPublicDir() {
  const candidates = [
    path.join(__dirname, 'public'),
    path.join(process.cwd(), 'public'),
    path.join(__dirname, '..', 'public'),
    path.join(process.cwd(), '..', 'public'),
    path.join('/var/task', 'public'),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
    } catch {
      /* lanjut */
    }
  }
  return path.join(__dirname, 'public');
}
const PUBLIC_DIR = findPublicDir();

// Muat file .env sederhana kalau ada (tanpa dependency dotenv).
(function loadEnv() {
  for (const dir of [process.cwd(), __dirname]) {
    try {
      const file = path.join(dir, '.env');
      if (!fs.existsSync(file)) continue;
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const key = m[1];
        const val = m[2].replace(/^['"]|['"]$/g, '');
        if (process.env[key] === undefined) process.env[key] = val;
      }
      break;
    } catch {
      /* abaikan */
    }
  }
})();

/* ------------------------------- sumber data ------------------------------ */
// Nama sumber tidak pernah dikirim ke browser: yang dipakai frontend cuma
// token acak, jadi asal data tidak terlihat di UI maupun di network tab.

// Scraper anime yang aktif: Samehadaku + Otakudesu.
const sources = { samehadaku, otakudesu };
// Sumber lokal hanya untuk pengujian pemutar (tidak masuk deploy produksi).
if (process.env.UJI_LOKAL === '1') sources.uji = require('./src/sources/uji');
const getSource = (id) => sources[id] || otakudesu;
const shuffledSources = () => Object.keys(sources).sort(() => Math.random() - 0.5);

// Cadangan: hasil terakhir yang pernah berhasil disimpan; kalau semua sumber
// sedang bermasalah, data itulah yang dikirim (ditandai `stale`) supaya aplikasi
// tidak pernah menampilkan kegagalan total.
// hasil "kosong" tidak layak dijadikan cadangan: kalau disimpan, data kosong itu
// akan terus dipakai tiap sumber gagal (pernah kejadian: One Piece 0 episode)
const hasilKosong = (h) => {
  if (!h) return true;
  if (Array.isArray(h)) return h.length === 0;
  if (Array.isArray(h.episodes)) return h.episodes.length === 0;
  if (Array.isArray(h.items)) return h.items.length === 0;
  if (Array.isArray(h.data)) return h.data.length === 0;
  // balasan API yang dibungkus: { ok, data: { episodes: [...] } }
  if (h.data && typeof h.data === 'object' && !Array.isArray(h.data) && Array.isArray(h.data.episodes)) {
    return h.data.episodes.length === 0;
  }
  return false;
};

async function denganCadangan(kunci, jalankan) {
  try {
    const hasil = await jalankan();
    if (hasil && !hasilKosong(hasil)) store.setKV('cadangan', kunci, { at: Date.now(), hasil }).catch(() => {});
    return Array.isArray(hasil) ? Object.assign([...hasil], { stale: false }) : { ...hasil, stale: false };
  } catch (err) {
    const simpan = await store.getKV('cadangan', kunci, null).catch(() => null);
    // cadangan yang kosong tidak dipakai — lebih baik teruskan error aslinya
    if (simpan && simpan.hasil && !hasilKosong(simpan.hasil)) {
      const h = simpan.hasil;
      return Array.isArray(h)
        ? Object.assign([...h], { stale: true, staleAt: simpan.at })
        : { ...h, stale: true, staleAt: simpan.at };
    }
    throw err;
  }
}

// Coba sumber secara acak; kalau satu gagal/kosong, pindah ke yang lain.
// Sumber yang baru gagal "didinginkan" 1 menit: dicoba paling akhir supaya satu
// sumber yang sedang mati tidak memperlambat semua permintaan (beranda, terbaru).
const sumberSakit = new Map();
const SEHAT_LAGI = 60 * 1000;

async function withRotation(fn, isValid = (r) => r && (!Array.isArray(r) || r.length)) {
  const semua = shuffledSources();
  const sehat = semua.filter((id) => (sumberSakit.get(id) || 0) <= Date.now());
  const dingin = semua.filter((id) => !sehat.includes(id));
  let lastErr = null;
  for (const id of [...sehat, ...dingin]) {
    try {
      const result = await fn(getSource(id), id);
      if (isValid(result)) {
        sumberSakit.delete(id);
        return { result, source: id };
      }
      lastErr = new Error('Sumber tidak punya data untuk judul ini');
    } catch (err) {
      sumberSakit.set(id, Date.now() + SEHAT_LAGI);
      lastErr = err;
    }
  }
  throw lastErr || new Error('Sumber sedang tidak bisa dihubungi');
}

// Ambil beberapa katalog sekaligus, lalu selang-seling dan deduplikasi hasilnya.
// Jika satu host bermasalah, hasil dari host lain tetap tampil.
async function gabungDariSumber(metode, argumen = {}, batasMs = 12000) {
  const ids = shuffledSources();
  // beranda dan pencarian ditata seperti referensi dengan Samehadaku sebagai lead;
  // sumber kedua tetap melengkapi hasil bila punya judul tambahan.
  ids.sort((a, b) => (a === 'samehadaku' ? -1 : 0) - (b === 'samehadaku' ? -1 : 0));
  const hasil = await Promise.all(ids.map(async (id) => {
    const src = getSource(id);
    if (typeof src?.[metode] !== 'function') return [];
    return denganBatas(
      Promise.resolve().then(() => src[metode](argumen)).catch(() => []),
      batasMs,
      []
    );
  }));
  const gabung = [];
  const max = Math.max(0, ...hasil.map((x) => Array.isArray(x) ? x.length : 0));
  for (let i = 0; i < max; i++) {
    for (const list of hasil) if (Array.isArray(list) && list[i]) gabung.push(list[i]);
  }
  const seen = new Set();
  return gabung.filter((x) => {
    const title = String(x.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const slug = String(x.slug || '');
    const key = slug ? `${slug}#${x.episode || ''}` : `${title}#${x.episode || ''}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ----------------- komentar, like, view, user, clan, moderasi --------------- */
// Penyimpanan: MongoDB kalau MONGODB_URI diisi, kalau tidak pakai memori + data/store.json
const store = require('./src/store');
const moderation = require('./src/moderation');
const { fromExp, REWARD, titleFor, frameFor } = require('./src/level');

store.ready().catch(() => {});

// aplikasi ini murni streaming anime — manga, novel, dan sejenisnya dibuang
const NON_ANIME = /(^|\s)(manga|manhwa|manhua|manhwa|novel(?:s)?|light novel|one[- ]?shot|doujin(?:shi)?|oel|artbook|picture book|4-koma|web novel|light-novel)([^a-z]|$)/i;
const TV_LABEL = { TV: 'Seri', TV_SHORT: 'Pendek', MOVIE: 'Movie', ONA: 'ONA', OVA: 'OVA', SPECIAL: 'Spesial', MUSIC: 'Musik' };
const noTVType = (t) => TV_LABEL[String(t || '').trim().toUpperCase()] || t || '';

const isAnimeItem = (it) => {
  if (!it) return false;
  const t = [it.type, it.format, it.media_type, it.mediaType].filter(Boolean).join(' ');
  if (!t) return true;                       // tidak ada label → anggap anime
  return !NON_ANIME.test(String(t).replace(/_/g, ' '));
};
const animeOnly = (list) => (Array.isArray(list) ? list.filter(isAnimeItem) : list);

const cleanKey = (k) => String(k || '').toLowerCase().replace(/[^a-z0-9:_-]/g, '').slice(0, 120);

/* --------------- sesi yang tahan refresh / restart (token bertanda tangan) ---------------
   Token bentuknya: <payload base64url>.<hmac sha256>. Payload berisi sub, nama & foto,
   jadi walau sesi di database hilang (restart, cold start Vercel), pengguna tetap login. */
const SESSION_SECRET = process.env.SESSION_SECRET || 'kelasnime-session-2026';

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

function readSignedToken(token) {
  const raw = String(token || '');
  const dot = raw.indexOf('.');
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const want = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p && p.sub ? p : null;
  } catch {
    return null;
  }
}

async function userFromToken(token) {
  if (!token) return null;
  // 1) sesi yang tersimpan di database
  try {
    const u = await store.userByToken(token);
    if (u) return u;
  } catch {
    /* lanjut ke token bertanda tangan */
  }
  // 2) token bertanda tangan: pakai data pengguna, atau pulihkan dari payload
  const p = readSignedToken(token);
  if (!p) return null;
  try {
    let u = await store.getUser(p.sub);
    if (!u) u = await store.upsertUser({ sub: p.sub, name: p.name || 'Nakama', picture: p.picture || '', email: p.email || '' });
    return u;
  } catch {
    return null;
  }
}
const stripTags = (t) => String(t || '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

// batasi spam per IP / per akun
const hits = new Map();
function rateOk(id, max = 20, windowMs = 60 * 1000) {
  const now = Date.now();
  const arr = (hits.get(id) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(id, arr);
  return arr.length <= max;
}

/* --------------------------- konfigurasi untuk UI -------------------------- */
app.get('/api/config', (req, res) => {
  const google = !!process.env.GOOGLE_CLIENT_ID;
  res.json({
    ok: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    backend: store.backend(),
    build: BUILD,
    // login demo hanya ditawarkan saat Google belum dikonfigurasi
    demo: google ? false : process.env.DEMO_LOGIN !== '0',
  });
});

/* ------------------------------- login google ------------------------------ */
let gClient = null;
function googleClient() {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) return null;
  if (!gClient) {
    try {
      const { OAuth2Client } = require('google-auth-library');
      gClient = new OAuth2Client(id);
    } catch {
      return null;
    }
  }
  return gClient;
}

const publicUser = (u) => {
  if (!u) return null;
  const level = fromExp(u.exp || 0);
  return {
    sub: u.sub,
    name: u.name,
    picture: u.picture || '',
    exp: u.exp || 0,
    clan: u.clan || '',
    level,
    title: titleFor(level.level),
    frame: frameFor(level.level),
    streak: u.streak || 0,
    lastDay: u.lastDay || '',
  };
};

async function userFromReq(req) {
  const h = req.headers?.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query?.token || '';
  if (!token) return null;
  return userFromToken(token);
}

app.post('/api/auth/google', async (req, res) => {
  const client = googleClient();
  if (!client) return res.status(503).json({ ok: false, error: 'Login Google belum dikonfigurasi di server' });
  const idToken = String(req.body?.credential || '').slice(0, 4096);
  if (!idToken) return res.status(400).json({ ok: false, error: 'Token Google kosong' });
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload() || {};
    const user = await store.upsertUser({
      sub: 'g' + p.sub,
      name: p.name || p.email || 'Pengguna',
      picture: p.picture || '',
      email: p.email || '',
    });
    const token = signToken({ sub: user.sub, name: user.name, picture: user.picture || '', iat: Date.now() });
    await store.setSession(token, user.sub).catch(() => {});
    res.json({ ok: true, token, user: publicUser(user) });
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Token Google tidak valid: ' + String(err.message).slice(0, 120) });
  }
});

/* --------- login demo: akun lokal, hanya saat Google belum dipasang -------- */
app.post('/api/auth/demo', async (req, res) => {
  if (process.env.GOOGLE_CLIENT_ID) {
    return res.status(403).json({ ok: false, error: 'Login Google sudah aktif' });
  }
  if (process.env.DEMO_LOGIN === '0') {
    return res.status(403).json({ ok: false, error: 'Login demo dimatikan' });
  }
  const name = String(req.body?.name || '').trim().slice(0, 24) || 'Nakama';
  const sub = 'd' + crypto.randomBytes(6).toString('hex');
  const user = await store.upsertUser({ sub, name, picture: '', email: '' });
  const token = signToken({ sub: user.sub, name: user.name, picture: '', iat: Date.now() });
  await store.setSession(token, user.sub).catch(() => {});
  res.json({ ok: true, token, user: publicUser(user) });
});

app.get('/api/me', async (req, res) => {
  const u = await userFromReq(req);
  res.json({ ok: true, user: publicUser(u), backend: store.backend(), google: !!process.env.GOOGLE_CLIENT_ID });
});

// tambah EXP (nonton, komentar, suka, harian, dll)
app.post('/api/me/exp', async (req, res) => {
  const u = await userFromReq(req);
  if (!u) return res.status(401).json({ ok: false, error: 'Silakan login dulu' });
  const amount = Math.min(100, Math.max(0, Number(req.body?.amount) || 0));
  if (!amount) return res.json({ ok: true, user: publicUser(u) });
  if (!rateOk('exp:' + u.sub, 60, 60 * 1000)) return res.status(429).json({ ok: false, error: 'Terlalu cepat' });
  const updated = await store.addExp(u.sub, amount);
  res.json({ ok: true, user: publicUser(updated) });
});

// check-in harian (streak 7 hari, EXP naik tiap hari)
app.post('/api/me/checkin', async (req, res) => {
  const u = await userFromReq(req);
  if (!u) return res.status(401).json({ ok: false, error: 'Silakan login dulu' });
  if (!rateOk('checkin:' + u.sub, 10, 60 * 1000)) return res.status(429).json({ ok: false, error: 'Terlalu cepat' });
  const r = await store.checkIn(u.sub);
  if (!r.ok && !r.sudah) return res.status(400).json({ ok: false, error: r.error || 'Gagal check-in' });
  res.json({ ok: true, sudah: !!r.sudah, streak: r.streak, reward: r.reward, user: publicUser(r.user) });
});

/* ------------------------------- komentar --------------------------------- */
app.get('/api/comments', async (req, res) => {
  const key = cleanKey(req.query.key);
  if (key === 'global') return res.status(404).json({ ok: false, error: 'Global chat sudah dihapus' });
  try { 
    const items = (await store.listComments(key)) || [];
    let users = {};
    try {
      users = await store.usersBySubs(items.map((c) => c.sub));
    } catch {
      users = {};
    }
    res.json({
      ok: true,
      items: items.map((c) => {
        const u = users[c.sub];
        const lv = fromExp(u?.exp || 0);
        return { ...c, ulevel: u ? lv.level : 0, uclan: u?.clan || '', utitle: u ? titleFor(lv.level) : '' };
      }),
    });
  } catch (err) {
    res.json({ ok: true, items: [] });
  }
});

/* ------------------------------ SUBSCRIBE -------------------------------- */
// daftar anime yang disimpan pengguna; tersimpan per akun, sinkron dengan perangkat
app.get('/api/subs', async (req, res) => {
  try {
    const user = await userFromReq(req);
    if (!user) return res.json({ ok: true, items: [], guest: true });
    const items = await store.getKV('subs', user.sub, []);
    res.json({ ok: true, items });
  } catch (err) {
    res.json({ ok: true, items: [] });
  }
});

app.post('/api/subs', async (req, res) => {
  try {
    const user = await userFromReq(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Masuk dulu untuk menyimpan' });
    const item = {
      slug: String(req.body?.slug || '').trim(),
      title: String(req.body?.title || '').trim(),
      poster: String(req.body?.poster || '').trim(),
      type: String(req.body?.type || '').trim(),
      at: Date.now(),
    };
    if (!item.slug) return res.status(400).json({ ok: false, error: 'Slug tidak valid' });
    const items = (await store.getKV('subs', user.sub, [])) || [];
    if (!items.some((x) => x.slug === item.slug)) items.unshift(item);
    await store.setKV('subs', user.sub, items.slice(0, 200));
    res.json({ ok: true, items: items.slice(0, 200) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) });
  }
});

app.delete('/api/subs', async (req, res) => {
  try {
    const user = await userFromReq(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Masuk dulu untuk mengubah' });
    const slug = String(req.body?.slug || '').trim();
    const items = ((await store.getKV('subs', user.sub, [])) || []).filter((x) => x.slug !== slug);
    await store.setKV('subs', user.sub, items);
    res.json({ ok: true, items });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) });
  }
});

app.post('/api/comments', async (req, res) => {
  const key = cleanKey(req.body?.key);
  if (key === 'global') return res.status(404).json({ ok: false, error: 'Global chat sudah dihapus' });
  const text = String(req.body?.text || '');
  const parentId = String(req.body?.parentId || '').slice(0, 40) || null;
  const user = await userFromReq(req);
  const ip = req.ip || 'x';

  if (!key) return res.status(400).json({ ok: false, error: 'Kunci komentar tidak valid' });
  // harus login supaya nama komentar mengikuti akun Google
  if (!user) return res.status(401).json({ ok: false, error: 'Masuk dulu untuk berkomentar' });
  if (!rateOk('c:' + (user ? user.sub : ip), 6, 5 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'Sabar, tunggu sebentar sebelum kirim lagi' });
  }

  const all = (await store.listComments(key)) || [];
  if (parentId && !all.some((c) => c.id === parentId)) {
    return res.status(400).json({ ok: false, error: 'Komentar yang dibalas tidak ada' });
  }

  // moderasi sederhana
  const recent = all
    .filter((c) => (user ? c.sub === user.sub : c.ip === ip))
    .slice(-6)
    .map((c) => c.text);
  const mod = moderation.check(text, { recent });
  if (!mod.ok) return res.status(400).json({ ok: false, error: mod.error });

  const item = {
    id: store.newId(),
    name: user ? user.name : stripTags(req.body?.name).slice(0, 24) || 'Anonim',
    sub: user ? user.sub : null,
    picture: user ? user.picture : '',
    text: mod.text,
    at: Date.now(),
    likes: 0,
    parentId,
    reports: 0,
    hidden: false,
    flags: mod.flags || [],
    ip: user ? '' : ip,
  };
  await store.addComment(key, item);
  if (mod.flags?.length) {
    await store.logModeration({ type: 'flag', key, id: item.id, flags: mod.flags, at: Date.now() });
  }
  if (user) await store.addExp(user.sub, parentId ? REWARD.reply : REWARD.comment);
  res.json({ ok: true, item, flags: mod.flags, exp: parentId ? REWARD.reply : REWARD.comment });
});

app.post('/api/comment-like', async (req, res) => {
  const key = cleanKey(req.body?.key);
  const id = String(req.body?.id || '');
  try {
    const likes = await store.likeComment(id);
    res.json({ ok: true, likes });
  } catch {
    res.status(404).json({ ok: false, error: 'Komentar tidak ada' });
  }
});

// laporkan komentar: 3 laporan -> otomatis disembunyikan
app.post('/api/comment-report', async (req, res) => {
  const key = cleanKey(req.body?.key);
  const id = String(req.body?.id || '');
  if (!rateOk('r:' + id + (req.ip || ''), 5, 5 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'Terlalu banyak laporan' });
  }
  const out = await store.reportComment(id);
  if (!out) return res.status(404).json({ ok: false, error: 'Komentar tidak ada' });
  res.json({ ok: true, ...out });
});

/* --------------------------------- like ----------------------------------- */
app.get('/api/like', async (req, res) => {
  const key = cleanKey(req.query.key);
  res.json({ ok: true, likes: await store.getLikes(key) });
});

app.post('/api/like', async (req, res) => {
  const key = cleanKey(req.body?.key);
  if (!key) return res.status(400).json({ ok: false, error: 'key wajib' });
  const user = await userFromReq(req);
  const likes = await store.bumpLikes(key);
  if (user) await store.addExp(user.sub, REWARD.like);
  res.json({ ok: true, likes });
});

/* --------------------- total tayang per judul (kartu detail) --------------- */
app.get('/api/views', async (req, res) => {
  const slug = cleanKey(req.query.slug);
  if (!slug) return res.status(400).json({ ok: false, error: 'slug wajib' });
  try {
    res.json({ ok: true, views: (await store.sumViews(slug)) || 0 });
  } catch {
    res.json({ ok: true, views: 0 });
  }
});

/* ------------------------------- hitung tayang ---------------------------- */
app.get('/api/view', async (req, res) => {
  const key = cleanKey(req.query.key);
  res.json({ ok: true, views: await store.getViews(key) });
});

app.post('/api/view', async (req, res) => {
  const key = cleanKey(req.body?.key);
  if (!key) return res.status(400).json({ ok: false, error: 'key wajib' });
  res.json({ ok: true, views: await store.bumpViews(key) });
});

/* ---------------------------------- clan ---------------------------------- */
app.get('/api/clans', async (req, res) => {
  try {
    const list = await store.listClans();
    res.json({ ok: true, items: (list || []).map((c) => ({ ...c, members: (c.members || []).length })) });
  } catch {
    res.json({ ok: true, items: [] });
  }
});

app.get('/api/clan/:tag', async (req, res) => {
  const clan = await store.getClan(req.params.tag);
  if (!clan) return res.json({ ok: true, clan: null, members: [] });
  const members = [];
  for (const sub of clan.members || []) {
    const u = await store.getUser(sub);
    members.push(u ? publicUser(u) : { sub, name: 'Anggota', exp: 0 });
  }
  members.sort((a, b) => (b.exp || 0) - (a.exp || 0));
  res.json({ ok: true, clan: { ...clan, members: members.length }, members });
});

app.post('/api/clan', async (req, res) => {
  const user = await userFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Login dulu untuk membuat clan' });
  const name = stripTags(req.body?.name).slice(0, 28);
  const tag = String(req.body?.tag || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (name.length < 3) return res.status(400).json({ ok: false, error: 'Nama clan minimal 3 huruf' });
  if (tag.length < 3) return res.status(400).json({ ok: false, error: 'Tag clan 3-6 karakter (huruf/angka)' });
  if (await store.getClan(tag)) return res.status(400).json({ ok: false, error: 'Tag itu sudah dipakai' });
  await store.createClan({ tag, name, owner: user.sub });
  await store.setUserClan(user.sub, tag);
  await store.addExp(user.sub, REWARD.clan);
  res.json({ ok: true, clan: await store.getClan(tag) });
});

app.post('/api/clan/join', async (req, res) => {
  const user = await userFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Login dulu untuk gabung clan' });
  const tag = String(req.body?.tag || '').toUpperCase();
  const clan = await store.getClan(tag);
  if (!clan) return res.status(404).json({ ok: false, error: 'Clan tidak ditemukan' });
  if ((clan.members || []).length >= 30) return res.status(400).json({ ok: false, error: 'Clan sudah penuh (30)' });
  if (!clan.members.includes(user.sub)) {
    await store.updateClan(tag, { members: [...(clan.members || []), user.sub] });
  }
  await store.setUserClan(user.sub, tag);
  res.json({ ok: true, clan: await store.getClan(tag) });
});

app.post('/api/clan/leave', async (req, res) => {
  const user = await userFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Login dulu' });
  const tag = user.clan || String(req.body?.tag || '').toUpperCase();
  if (!tag) return res.json({ ok: true });
  const clan = await store.getClan(tag);
  if (clan) {
    await store.updateClan(tag, { members: (clan.members || []).filter((m) => m !== user.sub) });
  }
  await store.setUserClan(user.sub, '');
  res.json({ ok: true });
});

/* --------------------------------- token --------------------------------- */
// Semua URL sumber disembunyikan di balik token terenkripsi (browser hanya tahu token).
// Token dulu disimpan di memori 12 jam → sering "episode tidak valid/kedaluwarsa"
// (lewat 12 jam, server restart, atau cold start). Sekarang tokennya mandiri:
// isinya dienkripsi (AES-256-GCM) jadi tidak pernah kedaluwarsa dan tetap
// menyembunyikan alamat sumber.
const tokens = new TTLCache(12 * 60 * 60 * 1000, 6000); // peninggalan token lama
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'kelasnime-token-2026';
const tokenKey = crypto.createHash('sha256').update(String(TOKEN_SECRET)).digest();

const sealToken = (payload) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', tokenKey, iv);
  const data = Buffer.concat([c.update(JSON.stringify(payload), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64url');
};

const openToken = (t) => {
  try {
    const raw = Buffer.from(String(t), 'base64url');
    if (raw.length < 29) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', tokenKey, raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
  } catch {
    return null;
  }
};

const makeToken = (payload) => sealToken(payload);
const readToken = (t) => (!t ? null : tokens.get(String(t)) || openToken(t));

const absUrl2 = (u) => {
  const v = String(u || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith('//')) return 'https:' + v;
  return '';
};
const posterUrl = (url) => (absUrl2(url) ? `/api/poster?p=${makeToken({ url: absUrl2(url) })}` : '');

// Bersihkan item sebelum dikirim ke browser: poster lewat proxy (token) dan
// semua jejak URL/nama sumber dibuang.
function sanitize(items = []) {
  return (items || []).map((it) => {
    if (!it) return it;
    const { url, source, poster, ...rest } = it;
    const out = { ...rest, poster: posterUrl(poster) };
    // kartu episode: simpan URL aslinya sebagai token supaya bisa langsung diputar
    if (rest.kind === 'episode' && url) out.e = makeToken({ url, num: rest.episode || null });
    return out;
  });
}

// Bersihkan sisa nama/brand sumber yang kadang nyelip di teks (sinopsis, dll)
const BRAND_RE = /(samehadaku|otakudesu|wibuku|nimeindo)(\.[a-z]{2,8})?/gi;
function cleanText(v) {
  if (typeof v !== 'string') return v;
  if (/^https?:\/\//i.test(v.trim())) return v; // URL jangan diutak-atik
  let s = v.replace(BRAND_RE, 'KelasNime');
  s = s.replace(/\s*\|\s*Situs\s+KelasNime[^.]*\.?/gi, ' ');
  s = s.replace(/(^|[.!?]\s)[^.!?]{0,80}\bKelasNime\b[^.!?]{0,80}\./gi, '$1');
  return s.replace(/\s{2,}/g, ' ').trim();
}
function deepClean(o) {
  if (typeof o === 'string') return cleanText(o);
  if (Array.isArray(o)) return o.map(deepClean);
  if (o && typeof o === 'object') {
    const r = {};
    for (const [k, v] of Object.entries(o)) r[k] = deepClean(v);
    return r;
  }
  return o;
}

// rapikan judul hasil tebakan dari slug: "chainsaw-man-reze-hen" -> "Chainsaw Man Reze Hen"
function prettySlug(slug = '') {
  const s = String(slug)
    .replace(/[-_%]+/g, ' ')
    .replace(/\b(index|subtitle indonesia|sub indo|eps|episode)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.replace(/(^|\s)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
}

// Satu layanan luar yang lambat tidak boleh menahan seluruh halaman:
// beri batas waktu, kalau lewat pakai nilai cadangan.
const denganBatas = (janji, ms, gagal = null) =>
  Promise.race([janji, new Promise((r) => setTimeout(() => r(gagal), ms))]).catch(() => gagal);

const sendError = (res, err, fallback = 'Terjadi kesalahan') => {
  const msg = err?.message || fallback;
  const status = /BLOCKED|timed out|ETIMEDOUT|ECONNRESET|tidak bisa dihubungi/i.test(msg) ? 502 : 500;
  res.status(status).json({ ok: false, error: msg.slice(0, 300) });
};

/* --------------------------------- status -------------------------------- */

app.get('/api/status', async (req, res) => {
  res.json({ ok: true, cache: cache.store.size, tokens: tokens.store.size, time: Date.now() });
});

app.get('/api/catalog', async (req, res) => {
  try {
    const status = /^(ongoing|complete)$/.test(String(req.query.status || '')) ? String(req.query.status) : 'all';
    const page = Math.max(1, Number(req.query.page) || 1);
    const items = await samehadaku.catalog({ status, page });
    res.json({ ok: true, data: sanitize(items) });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/latest', async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const out = await denganCadangan('latest:sources:v3:' + page, async () => {
      const result = await gabungDariSumber('latest', { page });
      if (!result.length) throw new Error('Daftar rilisan belum tersedia');
      return { ok: true, data: sanitize(result.slice(0, 36)) };
    });
    res.json(deepClean(out));
  } catch (err) {
    sendError(res, err);
  }
});

/* --------------------------------- search -------------------------------- */

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ ok: true, stream: [], info: [], q });
  const [stream, info] = await Promise.allSettled([
    denganBatas(
      denganCadangan('cari:sources:v3:' + q.toLowerCase(), async () => {
        const r = await gabungDariSumber('search', q);
        return sanitize(r);
      }),
      15000,
      []
    ),
    denganBatas(meta.search(q, { limit: 14 }), 10000, { items: [], _provider: null }),
  ]);
  res.json(deepClean({
    ok: true,
    q,
    stream: stream.status === 'fulfilled' ? stream.value : [],
    // hanya anime: manga / novel / doujin tidak ditampilkan
    info: animeOnly(info.status === 'fulfilled' ? info.value.items || [] : []),
    provider: info.status === 'fulfilled' ? info.value._provider : null,
    error: stream.status === 'rejected' ? String(stream.reason?.message || stream.reason).slice(0, 200) : null,
  }));
});

/* --------------------------- detail anime (stream) ------------------------ */

app.get('/api/anime', async (req, res) => {
  const { slug, id } = req.query;
  try {
    // detail murni metadata (tanpa link streaming)
    if (!slug && id) {
      const result = await meta.detail(id);
      return res.json({ ok: true, kind: 'meta', data: result.item, provider: result._provider });
    }
    if (!slug) return res.status(400).json({ ok: false, error: 'slug wajib diisi' });

    // resolve slug ke sumber mana pun yang punya datanya (diacak urutannya)
    // utamakan sumber yang punya episode; kalau tidak ada, terima yang punya judul saja
    // tanya seluruh sumber BERSAMAAN lalu ambil yang daftar episodenya paling
    // lengkap (1 → tamat). Kalau ditanya berurutan, sumber yang cuma punya
    // beberapa episode terbaru bisa menang duluan.
    const semuaSumber = shuffledSources();
    const sumberSehat = semuaSumber.filter((id) => (sumberSakit.get(id) || 0) <= Date.now());
    const sumberDingin = semuaSumber.filter((id) => !sumberSehat.includes(id));
    const kandidat = await Promise.all(
      [...sumberSehat, ...sumberDingin].map((id) =>
        denganBatas(
          Promise.resolve()
            .then(() => getSource(id).detail(slug))
            .then((r) => {
              if (r && (r.episodes || []).length) sumberSakit.delete(id);
              return r;
            })
            .catch((err) => {
              sumberSakit.set(id, Date.now() + SEHAT_LAGI);
              return null;
            }),
          // sumber yang baru gagal tidak diberi waktu lama lagi
          sumberSehat.includes(id) ? 8000 : 3000,
          null
        )
      )
    );
    const sah = kandidat.filter((r) => r && r.title);
    sah.sort((a, b) => (b.episodes?.length || 0) - (a.episodes?.length || 0));
    const rawDetail = sah[0] || (await withRotation((s) => s.detail(slug)));
    const detail = deepClean(rawDetail);

    // metadata pelengkap (poster/sinopsis/relasi) diberi batas waktu: kalau
    // layanannya lelet, daftar episode tetap tampil tanpa menunggu
    const match = await denganBatas(meta.matchTitle(detail.title).catch(() => null), 6000, null);
    let metaData = null;
    if (match) {
      metaData = await denganBatas(
        meta
          .detail(match.id)
          .then((r) => r.item)
          .catch(() => match),
        6000,
        match
      );
    }

    let episodes = (detail.episodes || []).map((e) => ({
      number: e.number,
      title: e.title,
      date: e.date || '',
      e: makeToken({ url: e.url, slug, num: e.number }), // token, bukan URL asli
    }));

    // movie / judul tunggal yang tidak punya daftar episode: buat 1 episode
    // supaya tidak muncul "Episode (0)" dan "Belum ada episode"
    if (!episodes.length && detail.url) {
      const film = /movie|ona|ova|special/i.test(String(detail.info?.Tipe || detail.status || '')) || !detail.totalEpisodes;
      if (film) {
        episodes = [
          {
            number: 1,
            title: `${detail.title} (Movie)`,
            date: '',
            e: makeToken({ url: detail.url, slug, num: 1 }),
          },
        ];
      }
    }

    const payload = deepClean({
      ok: true,
      kind: 'stream',
      data: {
        slug,
        title: detail.title,
        poster: posterUrl(detail.poster),
        synopsis: detail.synopsis,
        genres: detail.genres,
        info: detail.info,
        status: detail.status,
        totalEpisodes: detail.totalEpisodes || String(episodes.length || ''),
        episodes,
        relations: (metaData?.relations || [])
          .filter((r) => r?.id)
          .map((r) => ({
            id: r.id,
            title: r.title || '',
            poster: posterUrl(r.poster || ''),
            rel: r.rel || '',
            type: noTVType(r.type || r.format || ''),
          }))
          .slice(0, 10),
        recommendations: sanitize(detail.recommendations || [])
          .filter((r) => r.slug)
          .map((r) => {
            // judul dari sumber sering berformat "6.16 Eps 9 Judul Anime"
            const m = String(r.title || '').match(/^\s*([\d.]+)\s+Eps\s*(\d+)?\s*(.*)$/i);
            if (m) return { title: m[3].trim(), slug: r.slug, poster: r.poster, score: m[1], eps: m[2] || '' };
            return {
              title: r.title || prettySlug(r.slug),
              slug: r.slug,
              poster: r.poster,
              score: '',
              eps: '',
            };
          })
          .filter((r) => r.title),
      },
      meta: metaData,
      metaId: match?.id || null,
    });
    store.setKV('cadangan', 'anime:sources:v3:' + String(slug || id || ''), { at: Date.now(), hasil: payload }).catch(() => {});
    res.json(payload);
  } catch (err) {
    // semua sumber gagal: kirim detail terakhir yang pernah berhasil (kalau ada)
    const simpan = await store.getKV('cadangan', 'anime:sources:v3:' + String(slug || id || ''), null).catch(() => null);
    if (simpan && simpan.hasil) return res.json({ ...simpan.hasil, stale: true, staleAt: simpan.at });
    sendError(res, err);
  }
});

/* -------------------------------- episode -------------------------------- */
// Balikan hanya label server generik + nomor urut — tanpa URL dan tanpa nama asli.

const labelServer = (name, i) => {
  const q = (String(name).match(/(\d{3,4})\s*p/i) || [])[1];
  return q ? `Server ${i + 1} · ${q}p` : `Server ${i + 1}`;
};

const srcOf = (url) => {
  const u = String(url || '');
  // setiap sumber boleh mengaku sendiri lewat cocok() — jadi kalau alamat dasarnya
  // diarahkan ke server lain (uji/proxy), penyalurannya tetap benar
  for (const id of Object.keys(sources)) {
    const s = sources[id];
    if (s && typeof s.cocok === 'function' && s.cocok(u)) return s;
  }
  return otakudesu;
};

async function resolveEpisode(req) {
  let token = readToken(req.query.e);
  // token rusak/kedaluwarsa → cari ulang episode dari slug + nomor (kalau ada)
  if (!token?.url && req.query.slug && req.query.num) {
    try {
      const { result } = await withRotation((s) => s.detail(req.query.slug));
      const eps = (result?.episodes || []).sort((a, b) => a.number - b.number);
      const ep = eps.find((e) => Number(e.number) === Number(req.query.num));
      if (ep?.url) token = { url: ep.url, slug: req.query.slug, num: Number(req.query.num) };
    } catch {
      /* biarkan, error asli yang dipakai */
    }
  }
  const url = token?.url || req.query.url;
  // sumber uji lokal (UJI_LOKAL=1) memakai skema sendiri supaya jelas bukan sumber asli
  const ujiLokal = process.env.UJI_LOKAL === '1' && /^uji:\/\//i.test(String(url || ''));
  if (!url || !(ujiLokal || /^https?:\/\//i.test(url))) return null;
  try {
    const data = await srcOf(url).servers(url);
    // kalau sumber ini cuma punya link embed, cari berkas langsung (MP4/HLS)
    // dari sumber lain supaya bisa diputar dengan pemutar kita + bisa diunduh
    const punyaLangsung = (data.servers || []).some((x) => x.type === 'mp4' || x.type === 'hls');
    if ((!punyaLangsung || !(data.servers || []).length) && token?.slug && token?.num) {
      // halaman sumber kosong/hanya embed: pinjam pemutar dari sumber lain —
      // semua sumber ditanya BERSAMAAN, yang paling cepat menang (batas 12 dtk)
      const utama = srcOf(url);
      const batas = (janji) =>
        Promise.race([janji, new Promise((r) => setTimeout(() => r(null), 12000))]);
      const tugas = Object.keys(sources)
        .filter((id) => sources[id] !== utama)
        .map((id) =>
          batas(
            (async () => {
              try {
                const det = await getSource(id).detail(token.slug);
                const ep = (det?.episodes || []).find((e) => Number(e.number) === Number(token.num));
                if (!ep?.url || ep.url === url) return null;
                const d2 = await getSource(id).servers(ep.url);
                const milik = d2.servers || [];
                return milik.length ? milik : null;
              } catch {
                return null;
              }
            })()
          )
        );
      const hasil = await Promise.all(tugas);
      let pinjamLangsung = null;
      let pinjamEmbed = null;
      for (const milik of hasil) {
        if (!milik) continue;
        const langsung = milik.filter((x) => x.type === 'mp4' || x.type === 'hls');
        if (langsung.length && !pinjamLangsung) pinjamLangsung = langsung;
        if (milik.length && !pinjamEmbed) pinjamEmbed = milik;
      }
      if (pinjamLangsung) data.servers = [...pinjamLangsung, ...(data.servers || [])];
      else if (pinjamEmbed && !(data.servers || []).length) data.servers = pinjamEmbed;
    }
    return { url, data };
  } catch (err) {
    // sumber ini lagi rewel → cari episode yang sama di sumber lain
    if (token?.slug && token?.num) {
      try {
        const alt = await withRotation((s) => s.detail(token.slug));
        const eps = (alt?.result?.episodes || []).sort((a, b) => a.number - b.number);
        const ep = eps.find((e) => Number(e.number) === Number(token.num)) || eps[0];
        if (ep?.url && ep.url !== url) {
          const data = await srcOf(ep.url).servers(ep.url);
          return { url: ep.url, data };
        }
      } catch {
        /* jatuhkan error asli */
      }
    }
    throw err;
  }
}

app.get('/api/episode', async (req, res) => {
  try {
    const resolved = await resolveEpisode(req);
    if (!resolved) return res.status(400).json({ ok: false, error: 'Episode tidak valid/kedaluwarsa' });
    const servers = (resolved.data.servers || []).map((s, i) => ({
      n: i + 1,
      label: labelServer(s.name, i),
      type: s.type === 'mp4' || s.type === 'hls' ? s.type : 'embed',
      alive: !!s.alive,
      status: s.status || 0,
    }));
    const title = String(resolved.data.title || '').replace(/\s*Sub\s*Indo\s*$/i, '').trim();
    res.json(deepClean({ ok: true, title, total: servers.length, servers }));
  } catch (err) {
    sendError(res, err);
  }
});

/* -------------------------------- UNDUHAN ---------------------------------- */
// Sumber streaming cuma punya link embed, jadi berkas diambil dari Kusonime
// (Google Drive, Pixeldrain, Acefile, Terabox, Mega, dan lain-lain).
function directUrl(url = '') {
  // pixeldrain: halaman /u/ID → berkas langsung
  const pd = String(url).match(/pixeldrain\.com\/u\/([A-Za-z0-9_-]+)/i);
  if (pd) return 'https://pixeldrain.com/api/file/' + pd[1] + '?download';
  return url;
}

const isDirectHost = (url = '') =>
  /drive\.usercontent\.google\.com|pixeldrain\.com\/api|\.mp4($|\?)|\.mkv($|\?)/i.test(url);

const normTitle = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function skorMirip(q, t) {
  const a = normTitle(q);
  const b = normTitle(t);
  if (!a || !b) return 0;
  if (b === a) return 100;
  if (b.startsWith(a) || a.startsWith(b)) return 80;
  // kemiripan kata
  const wa = new Set(a.match(/[a-z]+|[0-9]+/g) || []);
  const wb = new Set(b.match(/[a-z]+|[0-9]+/g) || []);
  let sama = 0;
  wa.forEach((w) => { if (wb.has(w)) sama++; });
  return Math.round((sama / Math.max(1, wa.size)) * 60);
}

app.get('/api/downloads', async (req, res) => {
  const q = (req.query.q || '').trim();
  const slug = (req.query.slug || '').trim();
  if (!q && !slug) return res.status(400).json({ ok: false, error: 'judul wajib diisi' });
  try {
    let target = slug ? { slug } : null;
    if (!target) {
      const list = await kusonime.search(q);
      if (!list.length) return res.json({ ok: true, groups: [], url: null, title: q });
      target = list
        .map((x) => ({ ...x, skor: skorMirip(q, x.title) }))
        .sort((x, y) => y.skor - x.skor)[0];
    }
    const d = await kusonime.detail(target.slug);
    const judulBersih = String(d.title || q).replace(/[^\w\-. ]+/g, ' ').trim();
    const groups = (d.downloads || []).map((g) => ({
      quality: g.quality,
      links: g.links.map((l) => {
        const u = directUrl(l.url);
        const langsung = l.direct || isDirectHost(u);
        return {
          host: l.host,
          direct: langsung,
          url: langsung
            ? `/api/dl?u=${makeToken({ url: u, name: `${judulBersih} - ${g.quality}.mp4` })}`
            : u,
        };
      }),
    }));
    res.json(deepClean({ ok: true, title: d.title, url: d.url, poster: posterUrl(d.poster), groups }));
  } catch (err) {
    sendError(res, err);
  }
});

// proxy berkas: mengalirkan dari host asal dengan header "attachment"
app.get('/api/dl', async (req, res) => {
  const t = readToken(req.query.u);
  const target = t?.url;
  if (!target || !/^https:\/\//i.test(target)) return res.status(400).send('Tautan unduhan tidak valid.');
  try {
    const headers = { 'User-Agent': UA, Accept: '*/*' };
    if (req.headers.range) headers.Range = String(req.headers.range);
    const r = await fetch(target, { headers, redirect: 'follow' });
    ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'].forEach((h) => {
      const v = r.headers.get(h);
      if (v) res.set(h, v);
    });
    // sesuaikan akhiran nama berkas dengan jenis isinya (rar/zip/mp4/mkv…)
    const ctype = (r.headers.get('content-type') || '').toLowerCase();
    const extMap = [
      [/rar|application\/x-rar/, '.rar'], [/zip/, '.zip'], [/mp4/, '.mp4'],
      [/x-matroska|mkv/, '.mkv'], [/mpegurl/, '.m3u8'], [/octet-stream/, ''],
    ];
    let nama = String(t.name || 'anime').replace(/[^\w\-. ]+/g, '_').replace(/\.\w{1,5}$/, '');
    const ext = (extMap.find(([re]) => re.test(ctype)) || [null, '.mp4'])[1];
    nama = (nama + ext).replace(/\s+/g, ' ');
    res.set('Content-Disposition', `attachment; filename="${nama}"; filename*=UTF-8''${encodeURIComponent(nama)}`);
    res.status(r.status);
    if (!r.body) return res.end();
    const { Readable } = require('stream');
    Readable.fromWeb(r.body).pipe(res);
  } catch (err) {
    res.status(502).send('Gagap mengambil berkas: ' + String(err.message).slice(0, 120));
  }
});

// unduh berkas MP4 episode ini langsung lewat server kita (judul otomatis)
app.get('/api/dlmp4', async (req, res) => {
  let resolved = null;
  try {
    resolved = await resolveEpisode(req);
  } catch {
    resolved = null;
  }
  if (!resolved) return res.status(400).send('Episode tidak ditemukan.');
  const list = (resolved.data.servers || []).filter((x) => x.type === 'mp4');
  if (!list.length) return res.status(404).send('Berkas MP4 tidak tersedia untuk episode ini.');
  const n = Math.min(Math.max(1, Number(req.query.n) || 1), list.length);
  const s = list[n - 1];
  try {
    const headers = { 'User-Agent': UA, Accept: '*/*' };
    if (req.headers.range) headers.Range = String(req.headers.range);
    // coba sampai 3 kali: host penyimpan kadang menolak percobaan pertama
    let r = null;
    for (let i = 0; i < 3 && !r; i++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 45000);
        const res0 = await fetch(s.url, { headers, redirect: 'follow', signal: ctrl.signal });
        clearTimeout(timer);
        if (res0.status < 500) r = res0;
        else if (i === 2) r = res0;
      } catch (err) {
        if (i === 2) throw err;
        await new Promise((x) => setTimeout(x, 700));
      }
    }
    ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
      const v = r.headers.get(h);
      if (v) res.set(h, v);
    });
    const bersih = String(resolved.data.title || 'anime')
      .replace(/\s*Sub\s*Indo\s*$/i, '')
      .replace(/[^\w\-. ]+/g, ' ')
      .trim();
    const nama = `${bersih}.mp4`;
    res.set('Content-Disposition', `attachment; filename="${nama}"; filename*=UTF-8''${encodeURIComponent(nama)}`);
    res.status(r.status);
    if (!r.body) return res.end();
    const { Readable } = require('stream');
    Readable.fromWeb(r.body).pipe(res);
  } catch (err) {
    res.status(502).send('Gagal mengambil berkas: ' + String(err.message).slice(0, 120));
  }
});

/* ------------------------------ pemutar video ----------------------------- */
// /api/embed = halaman pemutar (dipanggil lewat iframe), /api/stream = byte proxy.

app.get('/api/embed', async (req, res) => {
  try {
    const resolved = await resolveEpisode(req);
    if (!resolved) return res.status(400).type('html').send('<p>Tautan episode tidak valid.</p>');
    const list = resolved.data.servers || [];
    const n = Math.min(Math.max(1, Number(req.query.n) || 1), list.length);
    const s = list[n - 1];
    if (!s) return res.status(404).type('html').send('<p>Server tidak tersedia.</p>');

    const eTok = encodeURIComponent(req.query.e || '');
    const streamUrl = '/api/stream?e=' + eTok + '&n=' + n;
    const slugJs = JSON.stringify(String(req.query.slug || ''));
    const numJs = JSON.stringify(String(req.query.num || ''));

    // server embed/script: tidak bisa dikontrol, langsung tampilkan apa adanya
    if (s.type !== 'mp4' && s.type !== 'hls') {
      return res.type('html').send(`<!doctype html><html lang="id"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{width:100%;height:100%;border:0;display:block;background:#000}</style>
</head><body>${s.html ? s.html : `<iframe src="${s.url}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen scrolling="no" frameborder="0"></iframe>`}</body></html>`);
    }

    // server mp4/hls: pemutar kita sendiri, lengkap dengan kontrol
    res.type('html').send(`<!doctype html><html lang="id"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>Pemutar KelasNime</title>
<style>
  * { box-sizing: border-box; }
  html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff}
  #stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
  video{width:100%;max-height:100%;background:#000;display:block;transform:scale(1.09) translateZ(0);
    transform-origin:50% 100%;backface-visibility:hidden}
  #stage:fullscreen{background:#000}
  #stage:-webkit-full-screen{background:#000}
  #lanjut{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:8;background:rgba(0,0,0,.72);
    color:#7dd3fc;font-size:12px;padding:7px 14px;border-radius:20px;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap}
  .tap{position:absolute;top:44px;bottom:64px;width:34%;z-index:4}
  #tapL{left:0} #tapR{right:0}
  .flash{position:absolute;top:50%;transform:translateY(-50%);font-size:12px;opacity:0;pointer-events:none;
    background:rgba(0,0,0,.55);padding:8px 12px;border-radius:20px;transition:opacity .15s;z-index:6}
  #flashL{left:14%} #flashR{right:14%}
  #big{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:5;pointer-events:none}
  #big span{width:64px;height:64px;border-radius:50%;background:rgba(0,0,0,.55);display:flex;align-items:center;
    justify-content:center;font-size:26px;opacity:0;transition:opacity .2s}
  #spinner{position:absolute;z-index:3;width:38px;height:38px;border:3px solid rgba(255,255,255,.25);
    border-top-color:#00e5ff;border-radius:50%;animation:spin .9s linear infinite;opacity:0;transition:opacity .2s}
  @keyframes spin{to{transform:rotate(360deg)}}
  #bottom{position:absolute;left:0;right:0;bottom:0;z-index:7;padding:6px 10px 8px;
    background:linear-gradient(transparent,rgba(0,0,0,.75));transition:opacity .25s}
  #seek{width:100%;-webkit-appearance:none;height:16px;background:transparent;margin:0}
  #seek::-webkit-slider-runnable-track{height:4px;background:rgba(255,255,255,.25);border-radius:4px}
  #seek::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:#00e5ff;margin-top:-5px}
  #seek::-moz-range-track{height:4px;background:rgba(255,255,255,.25);border-radius:4px}
  #seek::-moz-range-thumb{width:13px;height:13px;border:0;border-radius:50%;background:#00e5ff}
  #bar{display:flex;align-items:center;gap:8px;margin-top:2px}
  #bar button{background:transparent;border:0;color:#fff;font-size:13px;font-weight:700;padding:5px 7px;
    border-radius:8px;cursor:pointer;min-width:36px}
  #bar button:active{background:rgba(255,255,255,.15)}
  #tt{font-size:11.5px;color:#d1d5db;font-variant-numeric:tabular-nums;margin-left:auto;white-space:nowrap}
  #rate{background:rgba(0,0,0,.5);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:7px;font-size:11.5px;padding:3px 4px}
  .hide{opacity:0;pointer-events:none}
</style></head>
<body>
<div id="stage">
  <video id="v" playsinline preload="metadata"></video>
  <div class="tap" id="tapL"></div><div class="tap" id="tapR"></div>
  <div class="flash" id="flashL">-10 detik</div>
  <div class="flash" id="flashR">+10 detik</div>
  <div id="big"><span id="bigIc">&#9655;</span></div>
  <div id="spinner"></div>
  <div id="lanjut"></div>
  <div id="bottom">
    <input type="range" id="seek" min="0" max="1000" value="0" step="1" />
    <div id="bar">
      <button id="bpp" title="Putar / Jeda">&#9655;</button>
      <button id="bbk" title="Mundur 10 detik">&#171;10</button>
      <button id="bfw" title="Maju 10 detik">10&#187;</button>
      <span id="tt">00:00 / 00:00</span>
      <select id="rate" title="Kecepatan">
        <option value="0.75">0.75x</option><option value="1" selected>1x</option>
        <option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option>
      </select>
      <button id="bfs" title="Layar penuh">&#9974;</button>
    </div>
  </div>
</div>
<script src="/vendor/hls.min.js"></script>
<script>
  var v = document.getElementById('v');
  var seek = document.getElementById('seek'), tt = document.getElementById('tt');
  var sp = document.getElementById('spinner'), bigIc = document.getElementById('bigIc');
  var bottom = document.getElementById('bottom');
  var src = '${streamUrl}', type = '${s.type}';
  var KEY = 'kelasnime:pos:' + ${slugJs} + ':' + ${numJs};

  function tell(m, extra) {
    try { parent.postMessage(Object.assign({ kelasnime: m }, extra || {}), '*'); } catch (e) {}
  }
  function fmt(t) {
    t = Math.max(0, Math.floor(t || 0));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), ss = t % 60;
    return (h ? h + ':' + String(m).padStart(2,'0') : String(m)) + ':' + String(ss).padStart(2,'0');
  }
  function flash(id) {
    var el = document.getElementById(id);
    el.style.opacity = 1;
    setTimeout(function () { el.style.opacity = 0; }, 600);
  }
  function iconBurst(ch) {
    bigIc.innerHTML = ch;
    bigIc.style.opacity = 1;
    setTimeout(function () { bigIc.style.opacity = 0; }, 350);
  }

  // ---- posisi tonton: simpan tiap 5 detik, pulihkan otomatis ----
  var lastSave = 0;
  function simpanPos() {
    try {
      if (v.duration && v.currentTime > 5 && v.currentTime < v.duration - 8) {
        localStorage.setItem(KEY, JSON.stringify({ t: Math.floor(v.currentTime), d: Math.floor(v.duration), at: Date.now() }));
      }
    } catch (e) {}
  }
  v.addEventListener('loadedmetadata', function () {
    tt.textContent = fmt(v.currentTime) + ' / ' + fmt(v.duration);
    try {
      var p = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (p && p.t > 15 && v.duration && p.t < v.duration - 20) {
        v.currentTime = p.t;
        var el = document.getElementById('lanjut');
        el.textContent = 'Melanjutkan dari ' + fmt(p.t);
        el.style.opacity = 1;
        setTimeout(function () { el.style.opacity = 0; }, 4000);
        tell('resume', { t: p.t });
      }
    } catch (e) {}
  });
  v.addEventListener('timeupdate', function () {
    tt.textContent = fmt(v.currentTime) + ' / ' + fmt(v.duration);
    if (v.duration && !seek.dataset.drag) seek.value = Math.round((v.currentTime / v.duration) * 1000);
    var now = Date.now();
    if (now - lastSave > 5000) { lastSave = now; simpanPos(); }
  });
  window.addEventListener('pagehide', simpanPos);
  document.addEventListener('visibilitychange', function () { if (document.hidden) simpanPos(); });
  v.addEventListener('playing', function () { sp.style.opacity = 0; tell('ok'); tell('state', { playing: true }); sync(); });
  v.addEventListener('play', function () { tell('state', { playing: true }); sync(); });
  v.addEventListener('pause', function () { tell('state', { playing: false }); sync(); iconBurst('&#10073;&#10073;'); });
  v.addEventListener('waiting', function () { sp.style.opacity = 1; });
  v.addEventListener('canplay', function () { sp.style.opacity = 0; });
  v.addEventListener('ended', function () { try { localStorage.removeItem(KEY); } catch (e) {} tell('ended'); });
  v.addEventListener('error', function () { sp.style.opacity = 0; tell('error'); });

  function sync() { document.getElementById('bpp').innerHTML = v.paused ? '&#9655;' : '&#10073;&#10073;'; }

  document.getElementById('bpp').onclick = function () { v.paused ? v.play() : v.pause(); sync(); };
  document.getElementById('bbk').onclick = function () { v.currentTime = Math.max(0, v.currentTime - 10); flash('flashL'); iconBurst('&#171;10'); };
  document.getElementById('bfw').onclick = function () { v.currentTime = Math.min((v.duration || 0) - 0.5, v.currentTime + 10); flash('flashR'); iconBurst('10&#187;'); };
  // ---- layar penuh: otomatis miring ke landscape (seperti pemutar lain) ----
  function kunciLandscape() {
    try {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape')['catch'](function () {});
    } catch (e) {}
  }
  function lepasKunci() {
    try {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch (e) {}
  }
  function masukFull() {
    var el = document.getElementById('stage');
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    var p = req.call(el);
    if (p && p.then) p.then(kunciLandscape)['catch'](function () {});
    else kunciLandscape();
  }
  function keluarFull() {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
  function fullAktif() { return document.fullscreenElement || document.webkitFullscreenElement; }
  document.getElementById('bfs').onclick = function () {
    if (fullAktif()) keluarFull();
    else masukFull();
  };
  function onFsChange() {
    var aktif = !!fullAktif();
    if (aktif) kunciLandscape();
    else lepasKunci();
    // kabari halaman induk: kalau kunci orientasi ditolak di dalam iframe,
    // halaman induk (dokumen layar penuh) yang mencobanya
    tell(aktif ? 'fs-masuk' : 'fs-keluar');
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);
  // perintah dari halaman: tombol "Layar penuh" di luar pemutar
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.kelasnime !== 'cmd') return;
    if (d.action === 'fs') { if (fullAktif()) keluarFull(); else masukFull(); }
  });
  document.getElementById('rate').onchange = function (e) { v.playbackRate = parseFloat(e.target.value); };

  seek.addEventListener('input', function () { seek.dataset.drag = 1; });
  seek.addEventListener('change', function () {
    if (v.duration) v.currentTime = (seek.value / 1000) * v.duration;
    delete seek.dataset.drag;
  });

  // ketuk dua kali di kiri/kanan = skip 10 detik (gestur seperti YouTube)
  function taps(el, dir) {
    var last = 0;
    el.addEventListener('click', function (e) {
      var now = Date.now();
      if (now - last < 320) {
        if (dir > 0) { v.currentTime = Math.min((v.duration || 0) - 0.5, v.currentTime + 10); flash('flashR'); }
        else { v.currentTime = Math.max(0, v.currentTime - 10); flash('flashL'); }
      }
      last = now;
      if (v.paused) v.play();
    });
  }
  taps(document.getElementById('tapR'), 1);
  taps(document.getElementById('tapL'), -1);

  // keyboard: spasi, panah kiri/kanan, f, m
  document.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
    else if (e.key === 'ArrowLeft') { v.currentTime = Math.max(0, v.currentTime - 10); flash('flashL'); }
    else if (e.key === 'ArrowRight') { v.currentTime = Math.min((v.duration || 0) - 0.5, v.currentTime + 10); flash('flashR'); }
    else if (e.key === 'f') { document.getElementById('bfs').click(); }
    else if (e.key === 'm') { v.muted = !v.muted; }
  });

  // sembunyikan kontrol saat idle
  var idle;
  function poke() { bottom.classList.remove('hide'); clearTimeout(idle); idle = setTimeout(function () { if (!v.paused) bottom.classList.add('hide'); }, 3500); }
  document.addEventListener('mousemove', poke);
  document.addEventListener('touchstart', poke, { passive: true });
  poke();

  // perintah dari halaman induk (tombol di luar iframe)
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.kelasnime !== 'cmd') return;
    if (d.action === 'play') v.play();
    else if (d.action === 'pause') v.pause();
    else if (d.action === 'toggle') { v.paused ? v.play() : v.pause(); sync(); }
    else if (d.action === 'seek') { v.currentTime = Math.max(0, Math.min((v.duration || 0) - 0.5, v.currentTime + (d.value || 0))); flash(d.value > 0 ? 'flashR' : 'flashL'); }
    else if (d.action === 'rate') v.playbackRate = d.value || 1;
  });

  // pasang sumber
  sp.style.opacity = 1;
  if (type === 'hls' && !v.canPlayType('application/vnd.apple.mpegurl') && window.Hls) {
    var h = new Hls({ enableWorker: true });
    h.loadSource(src); h.attachMedia(v);
    h.on(window.Hls.Events.ERROR, function (_e, d) { if (d && d.fatal) { sp.style.opacity = 0; tell('error'); } });
  } else {
    v.src = src;
  }
  v.play().catch(function () { sp.style.opacity = 0; });
  var guard = setTimeout(function () { if (!v.currentTime) tell('error'); }, 15000);
  v.addEventListener('loadeddata', function () { clearTimeout(guard); });
  sync();
  tell('ready');
</script>
</body></html>`);
  } catch (err) {
    res.status(502).type('html').send('<p style="color:#fff;font-family:sans-serif">' + (err.message || 'gagal') + '</p>');
  }
});

const BLOCK_HOSTS =
  /(^|\.)(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|metadata\.)/i;

app.get('/api/stream', async (req, res) => {
  try {
    const resolved = await resolveEpisode(req);
    if (!resolved) return res.status(400).json({ ok: false, error: 'Episode tidak valid' });
    const list = resolved.data.servers || [];
    const n = Math.min(Math.max(1, Number(req.query.n) || 1), list.length);
    const s = list[n - 1];
    if (!s) return res.status(404).json({ ok: false, error: 'Server tidak tersedia' });

    const target = new URL(s.url);
    const ujiLokal = process.env.UJI_LOKAL === '1' && /^uji:\/\//i.test(String(resolved.url || ''));
    if (!ujiLokal && BLOCK_HOSTS.test(target.hostname)) return res.status(400).json({ ok: false, error: 'host dilarang' });

    const headers = { 'User-Agent': UA, Accept: req.headers.accept || '*/*', 'Accept-Language': 'id-ID,id;q=0.9' };
    headers.Referer = resolved.url;
    headers.Origin = new URL(resolved.url).origin;
    if (req.headers.range) headers.Range = req.headers.range;

    // ulangi sampai 2 kali: host penyimpan kadang menolak percobaan pertama
    let upstream = null;
    let lastErr = null;
    for (let i = 0; i < 2 && !upstream; i++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 40000);
        const r = await fetch(target.toString(), { headers, redirect: 'follow', signal: ctrl.signal });
        clearTimeout(timer);
        if (r.status < 500 || i === 1) upstream = r;
      } catch (err) {
        lastErr = err;
        if (i === 1) throw err;
        await new Promise((x) => setTimeout(x, 600));
      }
    }
    if (!upstream) throw lastErr || new Error('gagal mengambil video');

    ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'].forEach((h) => {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(upstream.status);
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
    else res.end();
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err.message) });
  }
});

/* ------------------------------ proxy gambar ----------------------------- */

app.get('/api/poster', async (req, res) => {
  const token = readToken(req.query.p);
  const target = token?.url;
  if (!target || !/^https?:\/\//i.test(target)) {
    // jangan pernah mengembalikan error untuk gambar: kirim placeholder transparan
    res.type('image/svg+xml');
    return res
      .status(200)
      .send('<svg xmlns="http://www.w3.org/2000/svg" width="150" height="210"><rect width="150" height="210" fill="#141b2c"/></svg>');
  }
  try {
    const r = await cache.wrap(
      `img:${target}`,
      async () => {
        const upstream = await fetch(target, {
          headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
        });
        return {
          status: upstream.status,
          type: upstream.headers.get('content-type') || 'image/jpeg',
          buffer: Buffer.from(await upstream.arrayBuffer()),
        };
      },
      6 * 60 * 60 * 1000
    );
    res.setHeader('Content-Type', r.type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(r.status).send(r.buffer);
  } catch (err) {
    // gambar gagal diambil → placeholder gelap, jangan pernah jadi error di klien
    res.type('image/svg+xml');
    return res
      .status(200)
      .send('<svg xmlns="http://www.w3.org/2000/svg" width="150" height="210"><rect width="150" height="210" fill="#141b2c"/></svg>');
  }
});

app.get('/api/img', async (req, res) => {
  const target = req.query.url;
  if (!target || !/^https?:\/\//i.test(target)) return res.status(400).send('url tidak valid');
  try {
    const r = await cache.wrap(
      `img:${target}`,
      async () => {
        const upstream = await fetch(target, {
          headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
        });
        return {
          status: upstream.status,
          type: upstream.headers.get('content-type') || 'image/jpeg',
          buffer: Buffer.from(await upstream.arrayBuffer()),
        };
      },
      6 * 60 * 60 * 1000
    );
    res.setHeader('Content-Type', r.type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(r.status).send(r.buffer);
  } catch {
    res.status(502).send('gagal mengambil gambar');
  }
});

/* -------------------------------- metadata ------------------------------- */

app.get('/api/meta/top', async (req, res) => {
  try {
    const d = await meta.top({
      type: req.query.type,
      filter: req.query.filter,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });
    res.json({ ok: true, ...d });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/meta/search', async (req, res) => {
  try {
    const d = await meta.search(req.query.q || '', { limit: Number(req.query.limit) || 14 });
    res.json({ ok: true, ...d });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/meta/anime/:id', async (req, res) => {
  try {
    const d = await meta.detail(req.params.id);
    res.json({ ok: true, ...d });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/meta/schedule', async (req, res) => {
  try {
    const d = await meta.schedule(req.query.day);
    res.json({ ok: true, ...d });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/meta/genres', async (req, res) => {
  try {
    const d = await meta.genres();
    res.json({ ok: true, ...d });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/meta/genre/:id', async (req, res) => {
  try {
    const d = await meta.byGenre(req.params.id, Number(req.query.page) || 1);
    res.json({ ok: true, ...d });
  } catch (err) {
    sendError(res, err);
  }
});

/* -------------------------------- frontend ------------------------------- */

// index:false → index.html selalu lewat fallback di bawah, supaya versi build
// bisa ditempelkan dan HTML-nya tidak ikut tersangkut di cache
app.use(express.static(PUBLIC_DIR, { maxAge: '10m', index: false }));

// fallback SPA (routing frontend pakai hash, jadi cukup kirim index.html)
app.get(/.*/, (req, res) => {
  const file = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(file)) {
    try {
      // tempel versi build ke setiap berkas supaya deploy baru tidak memakai
      // berkas lama yang masih tersimpan di cache browser
      const html = fs
        .readFileSync(file, 'utf8')
        .replace(/(href|src)="\/(app\.js|glass\.css|style\.css|vendor\/[^"]+)"/g, '$1="/$2?v=' + BUILD + '"');
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
      res.type('html');
      return res.send(html);
    } catch {
      return res.sendFile(file);
    }
  }
  res
    .status(500)
    .type('html')
    .send(
      '<h2>Frontend tidak ditemukan</h2><p>Folder <code>public/</code> tidak ikut ter-deploy. ' +
        'Di Vercel pastikan <code>public/**</code> masuk ke bundle (sudah diatur di vercel.json → includeFiles).</p>'
    );
});

module.exports = app;
