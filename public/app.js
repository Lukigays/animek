/* KelasNime — frontend
   Metadata: Jikan (MyAnimeList) + cadangan AniList
   Streaming: diambil real-time dari sumber publik, disajikan lewat API sendiri
   (semua tautan asli disembunyikan di balik token acak).
*/
const app = document.getElementById('app');
const badge = document.getElementById('src-badge');

/* ------------------------------- utilitas -------------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cacheStore = new Map();
async function api(path, { ttl = 5 * 60 * 1000 } = {}) {
  const hit = cacheStore.get(path);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const res = await fetch(path, { headers: authHeaders() });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Server menjawab ${res.status}`);
  }
  if (!res.ok || json.ok === false) {
    const err = new Error(json.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  cacheStore.set(path, { v: json, t: Date.now() });
  return json;
}

function img(src, alt = '') {
  const u = src || '';
  return `<img src="${esc(u)}" alt="${esc(alt)}" loading="lazy" decoding="async" onerror="this.style.opacity=0" />`;
}

// catatan kecil: data dari simpanan terakhir karena sumber sedang bermasalah
const catatanStale = (d) =>
  d && d.stale
    ? `<div class="notice stale">Menampilkan data terakhir yang berhasil diambil. Sumber sedang sibuk — muat ulang sebentar lagi.</div>`
    : '';

function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText =
      'position:fixed;left:50%;transform:translateX(-50%);bottom:80px;z-index:200;background:#111827;border:1px solid #1f2937;color:#e5e7eb;padding:10px 14px;border-radius:10px;font-size:12.5px;max-width:90%;box-shadow:0 8px 24px rgba(0,0,0,.5)';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.display = 'none'), 3200);
}

/* ---------------------------- akun, level, exp ----------------------------- */
const TOKEN_KEY = 'kelasnime:token';
const LOCAL_EXP = 'kelasnime:exp';
let ME = null; // { sub, name, picture, exp, clan, level }
let GOOGLE_ON = false;
let BACKEND = 'file';

const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
const authHeaders = (extra = {}) => (getToken() ? { ...extra, Authorization: 'Bearer ' + getToken() } : extra);

/* gelar & bingkai avatar mengikuti level (tanpa hewan peliharaan) */
const TITLES = [
  [1, 'Pemula'],
  [3, 'Otak-otak'],
  [5, 'Wibu Pemula'],
  [8, 'Ksatria Nime'],
  [12, 'Veteran'],
  [17, 'Dewa Nime'],
  [25, 'Legenda'],
  [40, 'Kaisar Nime'],
];
const titleOf = (level = 1) => {
  let t = 'Pemula';
  for (const [min, name] of TITLES) if (level >= min) t = name;
  return t;
};
const frameOf = (level = 1) => {
  if (level >= 25) return 6;
  if (level >= 17) return 5;
  if (level >= 12) return 4;
  if (level >= 8) return 3;
  if (level >= 5) return 2;
  if (level >= 3) return 1;
  return 0;
};

function levelOf(exp = 0) {
  const need = (l) => 50 * Math.pow(Math.max(1, l) - 1, 2);
  let level = 1;
  while (need(level + 1) <= exp && level < 999) level++;
  const start = need(level);
  const next = need(level + 1);
  const span = Math.max(1, next - start);
  return { level, exp, current: exp - start, need: span, percent: Math.min(100, Math.round(((exp - start) / span) * 100)) };
}

function paintHeader() {
  const av = document.getElementById('me-av');
  const nm = document.getElementById('me-name');
  const lv = document.getElementById('me-lvl');
  const fill = document.getElementById('me-fill');
  if (!av) return;
  const u = ME || { name: 'Tamu', picture: '', exp: 0, clan: '' };
  const L = levelOf(u.exp || 0);
  av.innerHTML = u.picture
    ? `<img src="${esc(u.picture)}" alt="" onerror="this.replaceWith('${(u.name || '?').slice(0, 1).toUpperCase()}')" />`
    : esc((u.name || '?').slice(0, 1).toUpperCase());
  const c = avatarOf(u.name || 'Tamu');
  av.style.background = c.color + '22';
  av.style.color = c.color;
  av.className = 'me-av av-f' + frameOf(L.level);
  const ttl = document.getElementById('me-title');
  if (ttl) ttl.textContent = titleOf(L.level);
  if (nm) nm.textContent = u.name || 'Tamu';
  if (lv) lv.textContent = 'Lvl. ' + L.level;
  if (fill) fill.style.width = L.percent + '%';
  const btn = document.getElementById('me-btn');
  if (btn) btn.title = `${u.name} · Lvl. ${L.level} · ${L.current}/${L.need} EXP`;
}

// notifikasi EXP melayang: "+15 EXP"
function expToast(amount) {
  if (!amount) return;
  const el = document.createElement('div');
  el.className = 'exp-float';
  el.textContent = '+' + amount + ' EXP';
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('go'), 20);
  setTimeout(() => el.remove(), 1600);
}

async function dailyBonus() {
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('kelasnime:daily') === today) return;
  localStorage.setItem('kelasnime:daily', today);
  await addExp(25, 'daily');
  setTimeout(() => toast('Bonus harian +25 EXP'), 800);
}

async function loadMe() {
  try {
    const r = await fetch('/api/me', { headers: authHeaders() });
    const j = await r.json();
    ME = j.user || null;
    GOOGLE_ON = !!j.google;
    BACKEND = j.backend || 'file';
  } catch {
    ME = null;
  }
  if (!ME) {
    const exp = Number(localStorage.getItem(LOCAL_EXP) || 0);
    ME = { sub: null, name: localStorage.getItem('kelasnime:name') || 'Tamu', picture: '', exp, clan: '', level: levelOf(exp) };
  }
  paintHeader();
  dailyBonus();
  return ME;
}

// tambah EXP: ke server kalau login, atau ke perangkat kalau belum login
async function addExp(amount, reason = '') {
  if (!amount) return;
  if (ME?.sub) {
    try {
      const r = await fetch('/api/me/exp', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ amount, reason }),
      });
      const j = await r.json();
      if (j.ok && j.user) {
        const beforeExp = ME?.exp || 0;
        const beforeLv = levelOf(beforeExp).level;
        ME = j.user;
        paintLevel();
        if ((ME.exp || 0) > beforeExp) expToast((ME.exp || 0) - beforeExp);
        const afterLv = levelOf(ME.exp || 0).level;
        if (afterLv > beforeLv) levelUpToast(afterLv);
        return;
      }
    } catch {
      /* offline: simpan lokal */
    }
  }
  const exp = Number(localStorage.getItem(LOCAL_EXP) || 0) + amount;
  expToast(amount);
  localStorage.setItem(LOCAL_EXP, String(exp));
  ME = { ...(ME || {}), exp, level: levelOf(exp) };
  paintHeader();
  if (reason !== 'daily') expToast(amount); // bonus harian sudah punya toast sendiri
}

/* ------------------------------- login google ------------------------------ */
let gsiReady = false;
function loadGSI(cb) {
  if (window.google?.accounts?.id) {
    gsiReady = true;
    return cb();
  }
  const sc = document.createElement('script');
  sc.src = 'https://accounts.google.com/gsi/client';
  sc.async = true;
  sc.defer = true;
  sc.onload = () => {
    gsiReady = true;
    cb();
  };
  sc.onerror = () => cb(new Error('gagal memuat skrip Google'));
  document.head.appendChild(sc);
}

function renderGoogleButton(el) {
  let cfg = null;
  fetch('/api/config')
    .then((r) => r.json())
    .then((j) => {
      cfg = j;
      GOOGLE_ON = !!j.googleClientId;
      if (!j.googleClientId) {
        el.innerHTML = `<div class="g-off">Login Google belum diaktifkan.<br/>
          Isi <code>GOOGLE_CLIENT_ID</code> di environment hosting untuk menyalakannya.</div>${
            j.demo
              ? `<button class="btn demo-login" id="demo-login">Masuk mode demo (tanpa Google)</button>
                 <div class="g-off small">Akun demo tersimpan di server seperti akun Google, jadi level &amp; clan bisa dicoba.</div>`
              : ''
          }`;
        const d = document.getElementById('demo-login');
        if (d) d.addEventListener('click', demoLogin);
        return;
      }
      loadGSI((err) => {
        if (err || !window.google?.accounts?.id) {
          el.innerHTML = `<div class="g-off">Skrip Google tidak bisa dimuat di pratinjau ini.
            Setelah di-deploy, tombol login akan tampil normal.</div>`;
          return;
        }
        window.google.accounts.id.initialize({
          client_id: j.googleClientId,
          callback: async (resp) => {
            try {
              const r = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: resp.credential }),
              });
              const j2 = await r.json();
              if (!j2.ok) throw new Error(j2.error || 'gagal');
              localStorage.setItem(TOKEN_KEY, j2.token);
              await loadMe();
              toast('Masuk sebagai ' + (ME?.name || 'pengguna'));
              if (location.hash.startsWith('#/profil')) viewProfile('komentar');
            } catch (e2) {
              toast('Login gagal: ' + e2.message);
            }
          },
        });
        window.google.accounts.id.renderButton(el, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 260,
        });
      });
    })
    .catch(() => {
      el.innerHTML = '<div class="g-off">Tidak bisa mengambil konfigurasi server.</div>';
    });
}

async function demoLogin() {
  const nm = (document.getElementById('prof-name')?.value || localStorage.getItem('kelasnime:name') || '').trim();
  try {
    const r = await fetch('/api/auth/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nm || 'Nakama' }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'gagal');
    localStorage.setItem(TOKEN_KEY, j.token);
    await loadMe();
    toast('Mode demo aktif sebagai ' + (ME?.name || 'Nakama'));
    if (location.hash.startsWith('#/profil')) viewProfile('komentar');
  } catch (e) {
    toast('Login demo gagal: ' + e.message);
  }
}

// segarkan tampilan level/EXP di semua tempat (kartu akun, header, profil)
function paintLevel() {
  paintHeader();
  document.querySelectorAll('.acc-name, .acc-card').forEach(() => {});
  const fill = document.querySelector('.acc-bar i');
  const teks = document.querySelector('.acc-lvl');
  const L = levelOf(ME?.exp || 0);
  if (fill) fill.style.width = L.percent + '%';
  if (teks) teks.textContent = `${L.current}/${L.need} EXP`;
  const lv = document.querySelector('.acc-lvl')?.parentElement?.querySelector('.acc-lvl');
  document.querySelectorAll('.acc-id').forEach((el) => {
    if (ME?.sub) el.textContent = `${ME.name || 'Nakama'} #${userIdNum(ME.sub)}${ME.clan ? ' · ' + ME.clan : ''}`;
  });
  document.querySelectorAll('.acc-stats .stat b, .acc-stats b').forEach(() => {});
}

function levelUpToast(level) {
  const el = document.createElement('div');
  el.className = 'levelup';
  el.innerHTML = `<b>LEVEL ${level}!</b><span>${esc(titleOf(level))} · bingkai ${esc(
    ['Biasa', 'Perunggu', 'Perak', 'Emas', 'Platinum', 'Epik', 'Legendaris'][frameOf(level)] || 'Biasa'
  )}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 30);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 2600);
}

async function checkIn() {
  if (!ME?.sub) return toast('Masuk dulu untuk klaim harian');
  try {
    const r = await fetch('/api/me/checkin', { method: 'POST', headers: authHeaders() });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'gagal');
    const before = levelOf(ME?.exp || 0).level;
    ME = j.user;
    paintLevel();

    // tombol klaim langsung berubah tanpa perlu refresh
    ['home-checkin', 'checkin'].forEach((id) => {
      const b = document.getElementById(id);
      if (!b) return;
      b.textContent = '✓ Hari ini';
      b.disabled = true;
      b.classList.add(id === 'checkin' ? 'ghost' : 'off');
    });

    if (j.sudah) return toast('Sudah check-in hari ini — besok lagi ya');
    expToast(j.reward);
    toast('Check-in hari ke-' + j.streak + ' · +' + j.reward + ' EXP');
    const after = levelOf(ME.exp || 0).level;
    if (after > before) levelUpToast(after);

    // segarkan isi halaman supaya peringkat & statistik ikut berubah
    if (location.hash.startsWith('#/profil')) viewProfile();
    else if (location.hash.startsWith('#/home')) viewHome();
  } catch (e) {
    toast('Check-in gagal: ' + e.message);
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  ME = null;
  loadMe().then(() => {
    toast('Berhasil keluar');
    if (location.hash.startsWith('#/profil')) viewProfile('komentar');
  });
}

/* ---------------------------- riwayat & progres --------------------------- */
const HIST = 'kelasnime:history';
const WATCHED = 'kelasnime:watched';
const SUBS = 'kelasnime:subs';

const readJSON = (k, fb) => {
  try {
    return JSON.parse(localStorage.getItem(k) || '') ?? fb;
  } catch {
    return fb;
  }
};
const getHistory = () => readJSON(HIST, []) || [];
const getWatched = () => readJSON(WATCHED, {}) || {};
const watchedOf = (slug) => getWatched()[slug] || [];
const lastOf = (slug) => getHistory().find((x) => x.slug === slug);

function saveHistory(entry) {
  const list = getHistory().filter((x) => x.slug !== entry.slug);
  list.unshift(entry);
  localStorage.setItem(HIST, JSON.stringify(list.slice(0, 24)));
}
function markWatched(slug, num) {
  const all = getWatched();
  const set = new Set(all[slug] || []);
  set.add(Number(num));
  all[slug] = [...set].sort((a, b) => a - b);
  // batasi 200 Judul supaya localStorage tidak membengkak
  const keys = Object.keys(all);
  if (keys.length > 200) delete all[keys[0]];
  localStorage.setItem(WATCHED, JSON.stringify(all));
}

/* --------------------------- sosial: like, share -------------------------- */
const timeAgo = (ts) => {
  const d = Math.max(0, Date.now() - Number(ts || 0));
  const m = Math.floor(d / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return m + ' menit lalu';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' jam lalu';
  const dd = Math.floor(h / 24);
  if (dd < 30) return dd + ' hari lalu';
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

const AVATAR_COLORS = ['#00e5ff', '#f43f5e', '#a78bfa', '#34d399', '#fbbf24', '#60a5fa', '#f472b6'];
function avatarOf(name = '?') {
  const n = String(name).trim() || '?';
  let sum = 0;
  for (let i = 0; i < n.length; i++) sum += n.charCodeAt(i);
  return {
    initial: n.slice(0, 1).toUpperCase(),
    color: AVATAR_COLORS[sum % AVATAR_COLORS.length],
  };
}

async function shareLink(title, url) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text: title, url });
      return;
    }
  } catch {
    /* pengguna membatalkan — jangan anggap error */
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Tautan disalin ke clipboard');
  } catch {
    toast(url);
  }
}

/* ------------------------------- komentar -------------------------------- */
const LOCAL_C = 'kelasnime:comments:';
const LIKED_C = 'kelasnime:cliked:';
const MINE_C = 'kelasnime:mycomments';
const REPORT_C = 'kelasnime:reported:';
const localComments = (key) => readJSON(LOCAL_C + key, []) || [];
const likedComments = (key) => readJSON(LIKED_C + key, []) || [];
const reportedComments = (key) => readJSON(REPORT_C + key, []) || [];
const myComments = () => readJSON(MINE_C, []) || [];

// simpan jejak komentar kiriman sendiri untuk halaman "Komentar saya"
function saveMyComment(key, item, title) {
  const list = myComments().filter((x) => x.id !== item.id);
  list.unshift({ key, id: item.id, text: item.text, at: item.at, title: title || '', parentId: item.parentId || null });
  localStorage.setItem(MINE_C, JSON.stringify(list.slice(0, 200)));
}
function dropMyComment(id) {
  localStorage.setItem(MINE_C, JSON.stringify(myComments().filter((x) => x.id !== id)));
}

// susun komentar jadi pohon (komentar utama + balasan)
function renderLevel(all, level, key, mine, depth = 0) {
  return level
    .map((c) => {
      const kids = all.filter((x) => x.parentId === c.id);
      if (c.hidden) {
        return `<div class="comment c-hidden" data-id="${esc(c.id)}">
          <div class="c-av" style="background:#1f2937;color:#6b7280">&#9873;</div>
          <div class="c-body"><div class="c-text muted">Komentar disembunyikan karena banyak laporan.</div>
          ${kids.length ? '<button class="c-show" data-cid="' + esc(c.id) + '">Tampilkan balasan (' + kids.length + ')</button>' : ''}
          <div class="c-replies" style="display:none">${renderLevel(all, kids, key, mine, depth + 1)}</div></div>
        </div>`;
      }
      const av = avatarOf(c.name);
      const liked = likedComments(key).includes(c.id);
      const reported = reportedComments(key).includes(c.id);
      const isMine = mine.has(c.id);
      const flags = c.flags || [];
      const flagBadge = flags.includes('sensor')
        ? '<span class="c-flag" title="Kata tidak pantas disensor otomatis">tersensor</span>'
        : flags.includes('link') || flags.includes('promosi')
        ? '<span class="c-flag" title="Tautan dihapus otomatis">tautan dihapus</span>'
        : '';
      const avatarHTML = c.picture
        ? `<img src="${esc(c.picture)}" alt="" onerror="this.style.display='none'" />`
        : esc(av.initial);
      const lvlChip = c.ulevel
        ? `<span class="c-lvl" title="${esc(c.utitle || '')}">Lvl. ${c.ulevel}</span>`
        : '';
      return `<div class="comment" data-id="${esc(c.id)}">
        <div class="c-av av-f${c.ulevel ? frameOf(c.ulevel) : 0}" style="background:${av.color}22;color:${av.color}">${avatarHTML}</div>
        <div class="c-body">
          <div class="c-head"><b>${esc(c.name)}</b>${lvlChip}${flagBadge}<span class="c-time">${esc(timeAgo(c.at))}</span></div>
          <div class="c-text">${esc(c.text)}</div>
          <div class="c-actions">
            <button class="c-like ${liked ? 'on' : ''}" data-cid="${esc(c.id)}" title="Suka">&#9829; <span>${c.likes || 0}</span></button>
            ${depth < 2 ? '<button class="c-reply" data-cid="' + esc(c.id) + '" data-name="' + esc(c.name) + '">Balas</button>' : ''}
            <button class="c-report ${reported ? 'on' : ''}" data-cid="${esc(c.id)}" title="Laporkan">&#9873; ${reported ? 'Dilaporkan' : 'Lapor'}</button>
            ${isMine ? '<button class="c-del" data-cid="' + esc(c.id) + '">Hapus</button>' : ''}
          </div>
          ${kids.length ? `<div class="c-replies">${renderLevel(all, kids, key, mine, depth + 1)}</div>` : ''}
          <div class="c-reply-slot" id="rs-${esc(c.id)}"></div>
        </div>
      </div>`;
    })
    .join('');
}

function commentsSection(key, title = '', count = 0) {
  const saya = ME?.sub
    ? `<div class="c-me">
         <span class="c-av av-f${frameOf(levelOf(ME.exp || 0).level)}">${esc((ME.name || 'N').slice(0, 1).toUpperCase())}</span>
         <span class="c-me-main">
           <b>${esc(ME.name || 'Nakama')}</b>
           <span class="c-lvl">${esc(titleOf(levelOf(ME.exp || 0).level))} · Lvl. ${levelOf(ME.exp || 0).level}</span>
         </span>
       </div>`
    : `<div class="c-login">
         <span>Masuk dulu untuk berkomentar. Nama komentar mengikuti akun Google-mu.</span>
         <button class="btn" data-nav="profil">Masuk</button>
       </div>`;
  return `
    <div class="section">
      <div class="section-head"><h2>Komentar <span class="ep-range">${count}</span></h2></div>
      <div class="c-form">
        ${saya}
        <textarea id="c-text" class="c-input c-area" placeholder="${
          ME?.sub ? 'Tulis komentar...' : 'Masuk dulu untuk berkomentar'
        }" maxlength="600" ${ME?.sub ? '' : 'disabled'}></textarea>
        <div class="c-row">
          <span class="c-note">Jangan lupa untuk membuat komentar yang sopan dan santun dan mengikuti Aturan Komunitas kami</span>
          ${ME?.sub ? '<button class="btn" id="c-send">Kirim</button>' : ''}
        </div>
      </div>
      <div class="c-list" id="c-list"><div class="empty">Memuat komentar…</div></div>
    </div>`;
}

async function loadComments(key) {
  const mine = new Set([
    ...localComments(key).map((c) => c.id),
    ...myComments().filter((c) => c.key === key).map((c) => c.id),
  ]);
  let server = [];
  try {
    const r = await fetch('/api/comments?key=' + encodeURIComponent(key));
    const j = await r.json();
    server = j.items || [];
  } catch {
    /* offline: pakai yang di perangkat saja */
  }
  const all = [...server, ...localComments(key)]
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)
    .map((c) => ({ ...c, parentId: c.parentId || null, reports: c.reports || 0, hidden: !!c.hidden }))
    .sort((a, b) => a.at - b.at);
  const el = document.getElementById('c-list');
  if (!el) return all;
  const roots = all.filter((c) => !c.parentId);
  el.innerHTML = all.length
    ? renderLevel(all, roots, key, mine, 0)
    : `<div class="empty">Belum ada komentar. Jadilah yang pertama!</div>`;
  // hitungan komentar hanya mengubah label di bagian komentar (jangan timpa hitungan episode)
  const label = document.getElementById('c-list')?.closest('.section')?.querySelector('.ep-range');
  if (label) label.textContent = String(all.length);
  return all;
}

// (gelar & bingkai sudah ada: titleOf(level) / frameOf(level) / levelOf(exp))

function replyForm(key, parentId, who) {
  return `<div class="c-reply-form">
    <textarea class="c-input c-area" id="rt-${esc(parentId)}" placeholder="Balas ${esc(who)}..." maxlength="600"></textarea>
    <div class="c-row">
      <span class="c-note">Balasanmu akan tampil di bawah komentar ini.</span>
      <button class="btn c-send-reply" data-cid="${esc(parentId)}">Balas</button>
      <button class="btn ghost c-cancel" data-cid="${esc(parentId)}">Batal</button>
    </div>
  </div>`;
}

async function postComment(key, text, parentId, title) {
  const name = ME?.name || 'Nakama';
  const item = {
    id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    text,
    at: Date.now(),
    likes: 0,
    parentId: parentId || null,
    reports: 0,
    hidden: false,
  };
  try {
    const r = await fetch('/api/comments', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ key, text, parentId }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || 'Gagal mengirim komentar');
    if (j.item) Object.assign(item, j.item);
    if (j.exp) await addExp(j.exp, parentId ? 'reply' : 'comment');
  } catch (err) {
    if (err.message && /pendek|sama|terlalu|sabar/i.test(err.message)) throw err;
    /* gagal kirim ke server: simpan di perangkat saja */
    const list = localComments(key);
    list.push(item);
    localStorage.setItem(LOCAL_C + key, JSON.stringify(list.slice(-100)));
  }
  saveMyComment(key, item, title);
  return item;
}

function bindComments(key, title = '') {
  const send = async () => {
    const textEl = document.getElementById('c-text');
    const text = (textEl?.value || '').trim();
    if (!ME?.sub) return toast('Masuk dulu untuk berkomentar');
    if (text.length < 2) return toast('Komentar terlalu pendek');
    const btn = document.getElementById('c-send');
    if (btn) btn.disabled = true;
    try {
      await postComment(key, text, null, title);
      if (textEl) textEl.value = '';
      await loadComments(key);
      toast('Komentar terkirim');
    } catch (err) {
      toast(err.message || 'Gagal mengirim komentar');
    }
    if (btn) btn.disabled = false;
  };

  document.getElementById('c-send')?.addEventListener('click', send);

  document.getElementById('c-list')?.addEventListener('click', async (e) => {
    const like = e.target.closest('.c-like');
    const reply = e.target.closest('.c-reply');
    const sendReply = e.target.closest('.c-send-reply');
    const cancel = e.target.closest('.c-cancel');
    const report = e.target.closest('.c-report');
    const del = e.target.closest('.c-del');
    const show = e.target.closest('.c-show');

    if (like) {
      const id = like.dataset.cid;
      const liked = readJSON(LIKED_C + key, []) || [];
      if (liked.includes(id)) return toast('Komentar ini sudah kamu sukai');
      liked.push(id);
      localStorage.setItem(LIKED_C + key, JSON.stringify(liked));
      try {
        await fetch('/api/comment-like', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, id }),
        });
      } catch {
        /* abaikan */
      }
      const span = like.querySelector('span');
      if (span) span.textContent = String(Number(span.textContent || 0) + 1);
      like.classList.add('on');
      return;
    }

    if (reply) {
      const id = reply.dataset.cid;
      const slot = document.getElementById('rs-' + id);
      if (!slot) return;
      slot.innerHTML = slot.innerHTML.trim()
        ? ''
        : replyForm(key, id, reply.dataset.name || 'komentar ini');
      const ta = document.getElementById('rt-' + id);
      if (ta) ta.focus();
      return;
    }

    if (cancel) {
      const slot = document.getElementById('rs-' + cancel.dataset.cid);
      if (slot) slot.innerHTML = '';
      return;
    }

    if (sendReply) {
      const id = sendReply.dataset.cid;
      const ta = document.getElementById('rt-' + id);
      const text = (ta?.value || '').trim();
      if (text.length < 2) return toast('Balasan terlalu pendek');
      sendReply.disabled = true;
      try {
        await postComment(key, text, id, title);
        await loadComments(key);
        toast('Balasan terkirim');
      } catch (err) {
        toast(err.message || 'Gagal mengirim balasan');
      }
      sendReply.disabled = false;
      return;
    }

    if (report) {
      const id = report.dataset.cid;
      const list = readJSON(REPORT_C + key, []) || [];
      if (list.includes(id)) return toast('Komentar ini sudah kamu laporkan');
      if (!confirm('Laporkan komentar ini karena melanggar aturan?')) return;
      list.push(id);
      localStorage.setItem(REPORT_C + key, JSON.stringify(list));
      try {
        const r = await fetch('/api/comment-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, id }),
        });
        const j = await r.json();
        if (j.hidden) toast('Komentar dilaporkan dan disembunyikan');
        else toast('Laporan terkirim, terima kasih');
      } catch {
        toast('Laporan tersimpan di perangkat');
      }
      await loadComments(key);
      return;
    }

    if (del) {
      const id = del.dataset.cid;
      const list = localComments(key).filter((c) => c.id !== id);
      localStorage.setItem(LOCAL_C + key, JSON.stringify(list));
      dropMyComment(id);
      await loadComments(key);
      return;
    }

    if (show) {
      const box = show.parentElement.querySelector('.c-replies');
      if (box) {
        box.style.display = box.style.display === 'none' ? '' : 'none';
        show.textContent = box.style.display === 'none' ? show.textContent.replace('Sembunyikan', 'Tampilkan') : show.textContent.replace('Tampilkan', 'Sembunyikan');
      }
    }
  });

  loadComments(key);
}

/* --------------------------------- profil -------------------------------- */
const storeLabel = () =>
  ME?.sub ? (BACKEND === 'mongodb' ? 'tersimpan di database' : 'tersimpan di server') : 'tersimpan di perangkat';

function profileStats() {
  const watched = Object.values(readJSON('kelasnime:watched', {}) || {}).reduce((a, b) => a + (b?.length || 0), 0);
  const liked = Object.keys(localStorage)
    .filter((k) => k.startsWith('kelasnime:liked:'))
    .map((k) => {
      try {
        return JSON.parse(localStorage.getItem(k) || '{}');
      } catch {
        return {};
      }
    })
    .filter((v) => v && v.t);
  return { comments: myComments().length, liked, watched, titles: getHistory().length };
}

function routeForKey(key) {
  if (key.startsWith('anime:')) return '#/anime/' + key.slice(6);
  if (key.startsWith('meta:')) return '#/meta/' + key.slice(5);
  return '';
}

async function viewProfile(tab = 'komentar') {
  const name = localStorage.getItem('kelasnime:name') || '';
  const st = profileStats();
  const av = avatarOf(name || 'Kamu');

  const tabKomentar = `
    ${
      myComments().length
        ? `<div class="prof-list">${myComments()
            .map(
              (c) => `<div class="prof-row" data-go-prof="${esc(routeForKey(c.key))}">
              <div class="prof-row-main">
                <div class="prof-row-title">${esc(c.title || c.key)}</div>
                <div class="prof-row-text">${esc(c.text)}</div>
                <div class="prof-row-meta">${esc(timeAgo(c.at))}${c.parentId ? ' · balasan' : ''}</div>
              </div>
              <button class="prof-del" data-del="${esc(c.id)}" title="Hapus dari riwayat saya">&#10005;</button>
            </div>`
            )
            .join('')}</div>`
        : `<div class="empty">Belum ada komentar dari kamu. Tulis komentar di halaman anime favoritmu!</div>`
    }`;

  const tabSuka = `
    ${
      st.liked.length
        ? `<div class="prof-list">${st.liked
            .map(
              (v) => `<div class="prof-row" data-go-prof="${esc(routeForKey(v.k || ''))}">
              <div class="prof-row-main">
                <div class="prof-row-title">${esc(v.t || '-')}</div>
                <div class="prof-row-meta">Disukai${v.at ? ' · ' + esc(timeAgo(v.at)) : ''}</div>
              </div>
            </div>`
            )
            .join('')}</div>`
        : `<div class="empty">Belum ada judul yang kamu sukai. Tekan tombol &#9829; di halaman nonton.</div>`
    }`;

  const history = getHistory();
  const tabRiwayat = `
    ${
      history.length
        ? `<div class="prof-list">${history
            .map(
              (h) => `<div class="prof-row" data-go-prof="#/anime/${esc(h.slug)}">
              <div class="prof-thumb">${img(h.poster, h.title)}</div>
              <div class="prof-row-main">
                <div class="prof-row-title">${esc(h.title)}</div>
                <div class="prof-row-meta">Lanjut EP ${h.number} · ${esc(timeAgo(h.at))}</div>
              </div>
            </div>`
            )
            .join('')}</div>`
        : `<div class="empty">Belum ada riwayat tonton.</div>`
    }`;

  const L = levelOf(ME?.exp || 0);
  const today = new Date().toISOString().slice(0, 10);
  const sudahHariIni = ME?.sub ? ME.lastDay === today : localStorage.getItem('kelasnime:daily') === today;
  const streak = ME?.sub ? ME.streak || 0 : 0;
  const checkCard = ME?.sub
    ? `<div class="checkin">
         <div class="checkin-top">
           <div><b>Check-in harian</b><span>Streak ${streak} hari · bonus naik tiap hari</span></div>
           <button class="btn ${sudahHariIni ? 'ghost' : ''}" id="checkin" ${sudahHariIni ? 'disabled' : ''}>${
             sudahHariIni ? 'Sudah diambil' : 'Klaim EXP'
           }</button>
         </div>
         <div class="checkin-days">${[1, 2, 3, 4, 5, 6, 7]
           .map((d) => `<span class="ci-dot ${streak >= d ? 'on' : ''}"><i>${d}</i></span>`)
           .join('')}</div>
       </div>`
    : '';
  const avatarHTML = ME?.picture
    ? `<img src="${esc(ME.picture)}" alt="" />`
    : esc(av.initial);

  app.innerHTML = `
    <div class="prof-card">
      <div class="prof-head">
        <div class="prof-av av-f${frameOf(L.level)}" style="background:${av.color}22;color:${av.color}">${avatarHTML}</div>
        <div class="prof-info">
          ${
            ME?.sub
              ? `<div class="prof-name-static">${esc(ME.name)}</div>
                 <div class="prof-sub">${
                   String(ME.sub || '').startsWith('g') ? 'Akun Google tersambung' : 'Akun demo tersambung'
                 } · ${esc(storeLabel())}</div>`
              : `<input id="prof-name" class="prof-name" placeholder="Nama kamu" maxlength="24" value="${esc(name)}" />
                 <div class="prof-sub">Mode tamu — profil tersimpan di perangkat ini</div>`
          }
        </div>
        ${ME?.sub ? '<button class="btn ghost" id="logout">Keluar</button>' : ''}
      </div>
      <div class="lvl">
        <div class="lvl-top"><b>Lvl. ${L.level}</b><span class="lvl-gelar">${esc(
          ME?.title || titleOf(L.level)
        )}</span><span>${L.current}/${L.need} EXP</span></div>
        <div class="lvl-bar"><i style="width:${L.percent}%"></i></div>
        <div class="lvl-hint">EXP: nonton +15 · komentar +8 · balas +5 · suka +2 · bagikan +5 · check-in harian</div>
      </div>
      ${checkCard}
      ${
        ME?.sub
          ? ''
          : `<div class="login-box">
               <div class="login-title">Masuk dengan Google</div>
               <div class="login-sub">Simpan level, EXP, dan clan-mu di server</div>
               <div id="gbtn"></div>
             </div>`
      }
      ${
        ME?.clan
          ? `<div class="clan-mini" data-go="clan">
               <div><div class="clan-tag">${esc(ME.clan)}</div><div class="clan-sub">Clan kamu</div></div>
               <span>›</span>
             </div>`
          : `<div class="clan-mini" data-go="clan">
               <div><div class="clan-tag">+ Gabung Clan</div><div class="clan-sub">Buat atau gabung grup nonton</div></div>
               <span>›</span>
             </div>`
      }
    </div>
    <div class="prof-stats">
      <div><b>${st.comments}</b><span>Komentar</span></div>
      <div><b>${st.liked.length}</b><span>Disukai</span></div>
      <div><b>${st.watched}</b><span>Episode</span></div>
      <div><b>${st.titles}</b><span>Judul</span></div>
    </div>
    <div class="tabs">
      <button class="tab ${tab === 'komentar' ? 'active' : ''}" data-tab="komentar">Komentar saya</button>
      <button class="tab ${tab === 'suka' ? 'active' : ''}" data-tab="suka">Disukai</button>
      <button class="tab ${tab === 'riwayat' ? 'active' : ''}" data-tab="riwayat">Riwayat tonton</button>
    </div>
    <div id="prof-body">${tab === 'suka' ? tabSuka : tab === 'riwayat' ? tabRiwayat : tabKomentar}</div>
    <div class="c-note pad" id="build-note">Versi aplikasi: <b id="build-id">…</b></div>`;

  // penanda versi: untuk memastikan yang dibuka sudah build terbaru
  api('/api/config', { ttl: 0 })
    .then((c) => {
      const el = document.getElementById('build-id');
      if (el && c?.build) el.textContent = c.build;
    })
    .catch(() => {});

  document.querySelectorAll('.tab').forEach((b) =>
    b.addEventListener('click', () => viewProfile(b.dataset.tab))
  );
  document.getElementById('prof-name')?.addEventListener('change', (e) => {
    localStorage.setItem('kelasnime:name', (e.target.value || '').trim());
    if (ME) ME.name = (e.target.value || '').trim();
    paintHeader();
    toast('Nama disimpan');
  });
  document.getElementById('logout')?.addEventListener('click', logout);
  document.getElementById('checkin')?.addEventListener('click', checkIn);
  const gbtn = document.getElementById('gbtn');
  if (gbtn) renderGoogleButton(gbtn);
  document.getElementById('prof-body')?.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      dropMyComment(del.dataset.del);
      viewProfile('komentar');
      return;
    }
    const row = e.target.closest('[data-go-prof]');
    const to = row?.getAttribute('data-go-prof');
    if (to) location.hash = to;
  });
}

/* --------------------------------- kartu --------------------------------- */
function streamCard(item) {
  const badgeEp = item.episode ? `<span class="badge eps">EP ${item.episode}</span>` : '';
  const badgeScore = item.score ? `<span class="badge score">★ ${item.score}</span>` : '';
  const thumb = `
      <div class="thumb">
        ${img(item.poster, item.title)}
        ${badgeEp}${badgeScore}
      </div>`;
  // kartu rilisan: tetap ke halaman detail supaya episode bisa dipilih dulu
  if (item.slug) {
    // slug episode ("one-piece-episode-1180-...") → slug serinya ("one-piece")
    const slugSeri = String(item.slug).replace(/-episode-\d+.*$/i, '') || item.slug;
    item = { ...item, slug: slugSeri };
    const lanjut = lastOf(item.slug);
    return `
    <div class="card" data-go="anime" data-slug="${esc(item.slug)}">
      ${thumb}
      <div class="title">${esc(item.title)}</div>
      <div class="sub">${item.episode ? `Episode ${item.episode}` : esc(noTV(item.type))}${item.status ? ' · ' + esc(item.status) : ''}</div>
    </div>`;
  }
  // tanpa slug: terpaksa langsung ke pemutar
  if (item.e) {
    return `
    <div class="card" data-go="watch" data-e="${esc(item.e)}" data-num="${item.episode || ''}"
         data-title="${esc(item.title)}" data-poster="${esc(item.poster)}">
      ${thumb}
      <div class="title">${esc(item.title)}</div>
      <div class="sub">Episode ${item.episode || ''}</div>
    </div>`;
  }
  const last = lastOf(item.slug);
  return `
    <div class="card" data-go="anime" data-slug="${esc(item.slug)}">
      ${thumb}
      <div class="title">${esc(item.title)}</div>
      <div class="sub">${last ? `Lanjut EP ${last.number}` : esc(item.status || item.released || 'Sub Indo')}</div>
    </div>`;
}

const REL_ID = {
  SEQUEL: 'Sekuel', PREQUEL: 'Prekuel', ALTERNATIVE: 'Alternatif', SIDE_STORY: 'Side Story',
  SPIN_OFF: 'Spin-off', ADAPTATION: 'Adaptasi', CHARACTER: 'Karakter', SUMMARY: 'Ringkasan',
  SOURCE: 'Sumber', MUSIC: 'Musik', ED: 'Ending', OP: 'Opening', FULL: 'Versi Penuh',
  ORIGINAL: 'Asli', TV: 'Seri', MOVIE: 'Movie', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Spesial',
  PARENT: 'Seri Utama', CONTAINS: 'Termasuk', COMPILATION: 'Kompilasi', OTHER: 'Terkait',
};
// relasi yang masih satu keluarga seri (menemani season lanjutan)
const SERI_REL = new Set(['SEQUEL', 'PREQUEL', 'ALTERNATIVE', 'PARENT', 'SIDE_STORY']);
// kalau judulnya jelas season ke-N, tampilkan "S2" seperti di aplikasi referensi
const ROMAWI = { II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
function seasonOf(title = '') {
  const t = String(title);
  const m = t.match(/(?:\bseason\s*(\d+)|\b(\d+)(?:st|nd|rd|th)\s*season|\bs(\d)\b|\bpart\s*(\d+)\b)/i);
  let n = m ? Number(m[1] || m[2] || m[3] || m[4]) : 0;
  if (!n) {
    // lanjutan sering ditulis dengan angka romawi di ujung judul: "... II"
    const r = t.match(/\b(II|III|IV|V|VI|VII|VIII|IX|X)\b\s*$/);
    n = r ? ROMAWI[r[1].toUpperCase()] || 0 : 0;
  }
  return n && n > 1 ? 'S' + n : '';
}

function relatedCard(item) {
  const badge = item.badge || (item.eps ? 'Eps ' + item.eps : '');
  const badgeHTML = badge ? `<span class="badge ${item.badge ? 'rel' : 'eps'}">${esc(badge)}</span>` : '';
  const score = item.score ? `<span class="badge score">★ ${item.score}</span>` : '';
  const go = item.kind === 'meta' ? `data-go="meta" data-id="${esc(item.id)}"` : `data-go="anime" data-slug="${esc(item.slug)}"`;
  return `
    <div class="card" ${go}>
      <div class="thumb">
        ${img(item.poster, item.title)}
        ${badgeHTML}${score}
      </div>
      <div class="title">${esc(item.title)}</div>
      <div class="sub">${esc(item.sub || '')}</div>
    </div>`;
}

function metaCard(item) {
  return `
    <div class="card" data-go="meta" data-id="${item.id}">
      <div class="thumb">
        ${img(item.poster, item.title)}
        ${item.score ? `<span class="badge score">★ ${item.score}</span>` : ''}
      </div>
      <div class="title">${esc(item.title)}</div>
      <div class="sub">${esc(noTV(item.type))} ${item.episodes ? '· ' + item.episodes + ' ep' : ''}</div>
    </div>`;
}

const hscroll = (items, fn) => `<div class="hscroll">${items.map(fn).join('')}</div>`;

// murni anime streaming: label bertipe TV tidak pernah ditampilkan
// Hanya dua label yang boleh tampil di web: "Movie" atau "Anime".
// OVA/ONA/Spesial/Musik/Pendek/dll. tidak pernah muncul sebagai tulisan.
const noTV = (t) => {
  const k = String(t || '').trim().toUpperCase();
  if (!k) return '';
  if (/\b(MOVIE|FILM)\b/.test(k.replace(/_/g, ' '))) return 'Movie';
  return 'Anime';
};

function section(title, body, moreRoute = null, extra = '') {
  return `
    <div class="section">
      <div class="section-head">
        <h2>${esc(title)} ${extra}</h2>
        ${moreRoute ? `<span class="more" data-nav="${moreRoute}">Semua &gt;</span>` : ''}
      </div>
      ${body}
    </div>`;
}

/* ------------------------------ search bar ------------------------------- */
function searchBar(q = '') {
  return `
    <div class="searchbar">
      <input id="search-input" placeholder="Cari Anime Di Sini" value="${esc(q)}" />
      <button class="btn" id="search-btn">Cari</button>
    </div>`;
}
function bindEpGroups(asc) {
  document.querySelectorAll('.ep-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.ep-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const range = chip.dataset.epg;
      document.querySelectorAll('#ep-list .ep-item').forEach((el) => {
        const n = Number(el.dataset.ep);
        if (range === 'all') return (el.style.display = '');
        const [a, b] = range.split('-').map(Number);
        el.style.display = n >= a && n <= b ? '' : 'none';
      });
    });
  });
  const first = document.querySelectorAll('.ep-chip')[1];
  if (first) first.click();
}

async function openDownloads(title, params) {
  if (!title) return toast('Judul belum diketahui.');
  const sheet = document.createElement('div');
  sheet.className = 'sheet-wrap';
  sheet.innerHTML = `<div class="sheet"><div class="sheet-head"><h3>Unduh</h3><button class="sheet-close" aria-label="Tutup">&times;</button></div>
     <div class="sheet-body"><div class="loader">Mencari link unduhan…</div></div></div>`;
  document.body.appendChild(sheet);
  const tutup = () => sheet.remove();
  sheet.querySelector('.sheet-close').addEventListener('click', tutup);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) tutup(); });

  // 1) berkas langsung dari pemutar (MP4) — unduh per episode
  const groups = [];
  try {
    if (params?.e) {
      const s = await api(
        `/api/episode?e=${encodeURIComponent(params.e)}&slug=${encodeURIComponent(params.slug || '')}&num=${encodeURIComponent(
          params.num || ''
        )}`,
        { ttl: 15 * 60 * 1000 }
      );
      const berkas = (s.servers || []).filter((x) => x.type === 'mp4');
      if (berkas.length) {
        groups.push({
          quality: `Episode ${params.num || ''} · MP4`,
          links: berkas.map((x, i) => ({
            host: berkas.length > 1 ? `MP4 ${i + 1}` : 'MP4',
            direct: true,
            url: `/api/dlmp4?e=${encodeURIComponent(params.e)}&n=${x.n}&slug=${encodeURIComponent(
              params.slug || ''
            )}&num=${encodeURIComponent(params.num || '')}`,
          })),
        });
      }
    }
  } catch {
    /* lanjut ke sumber unduhan */
  }

  // 2) link unduhan dari arsip unduhan terpisah
  let d = null;
  try {
    d = await api(`/api/downloads?q=${encodeURIComponent(title)}`, { ttl: 10 * 60 * 1000 });
  } catch (err) {
    if (!groups.length) {
      sheet.querySelector('.sheet-body').innerHTML = `<div class="empty">Link unduhan gagal dimuat.<br/>${esc(err.message)}</div>`;
      return;
    }
  }
  (d?.groups || []).forEach((g) => groups.push(g));
  if (!groups.length) {
    sheet.querySelector('.sheet-body').innerHTML = `<div class="empty">Belum ada link unduhan untuk “${esc(title)}”.</div>`;
    return;
  }
  sheet.querySelector('.sheet-body').innerHTML = groups
    .map(
      (g) => `<div class="dl-group">
        <div class="dl-q">${esc(g.quality)}</div>
        <div class="dl-links">${g.links
          .map(
            (l) => `<a class="dl-link${l.direct ? ' direct' : ''}" href="${esc(l.url)}"
              ${l.direct ? 'download' : 'target="_blank" rel="noopener noreferrer"'}>${esc(l.host)}${l.direct ? ' ⬇' : ' ↗'}</a>`
          )
          .join('')}</div>
      </div>`
    )
    .join('');
  const batch = groups.some((g) => /^\d+\s*-\s*\d+$/.test(String(g.quality || '').trim()));
  sheet.querySelector('.sheet-body').innerHTML +=
    `<div class="dl-note">` +
    (batch ? 'Ini berkas <b>batch</b> (sekian episode jadi satu paket). ' : 'Berkas disediakan oleh arsip unduhan. ') +
    `Host bertanda ⬇ diunduh langsung, sisanya membuka situs penyedia.</div>`;
}

function bindSearch() {
  const input = document.getElementById('search-input');
  const btn = document.getElementById('search-btn');
  const run = () => {
    const q = (input?.value || '').trim();
    if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
  };
  btn?.addEventListener('click', run);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run();
  });
}

/* -------------------- kartu akun, misi nonton, global chat ---------------- */
function userIdNum() {
  const seed = ME?.sub || localStorage.getItem('kelasnime:name') || 'tamu';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return String(1000000 + (h % 9000000));
}

// total jam nonton (1 episode ≈ 24 menit)
function watchHours() {
  const n = getHistory().length || 0;
  return (n * 24) / 60;
}
const fmtJam = (h) => (Math.round(h * 100) / 100).toFixed(2).replace('.', ',');

function accCard() {
  const u = ME || { name: 'Tamu', picture: '', exp: 0, clan: '', streak: 0 };
  const L = levelOf(u.exp || 0);
  const av = avatarOf(u.name || 'Tamu');
  const avatarHTML = u.picture ? `<img src="${esc(u.picture)}" alt="" />` : esc(av.initial);
  const jam = fmtJam(watchHours());
  const today = new Date().toISOString().slice(0, 10);
  const sudah = ME?.sub ? ME.lastDay === today : localStorage.getItem('kelasnime:daily') === today;
  return `<div class="acc-card">
    <div class="acc-top">
      <div class="acc-av av-f${frameOf(L.level)}" style="background:${av.color}22;color:${av.color}">${avatarHTML}</div>
      <div class="acc-main">
        <div class="acc-name">${esc(u.name || 'Tamu')} <span class="acc-id">#${userIdNum()}</span></div>
        <div class="acc-lvl"><b>Lvl. ${L.level}</b><span>${L.current}/${L.need} EXP</span></div>
        <div class="acc-bar"><i style="width:${L.percent}%"></i></div>
      </div>
      ${ME?.sub ? `<button class="acc-cta ${sudah ? 'off' : ''}" id="home-checkin" ${sudah ? 'disabled' : ''}>${sudah ? '✓ Hari ini' : 'Klaim'}</button>` : `<button class="acc-cta" data-nav="profil">Masuk</button>`}
    </div>
    <div class="acc-stats">
      <div><b>${jam}</b><span>Jam nonton</span></div>
      <div><b>${L.exp}</b><span>Total EXP</span></div>
      <div><b>${u.clan ? esc(u.clan) : '-'}</b><span>Clan</span></div>
      <div><b>${u.streak || 0}</b><span>Streak</span></div>
    </div>
  </div>`;
}

function missionCard() {
  const jam = watchHours();
  const target = Math.max(5, Math.ceil((jam + 0.01) / 5) * 5); // target kelipatan 5 jam berikutnya
  const pct = Math.min(100, Math.round((jam / target) * 100));
  const sisa = Math.max(0, target - jam);
  return `<div class="mission">
    <div class="mission-ic">⏱</div>
    <div class="mission-main">
      <b>Tambah lagi yuk durasinya</b>
      <span>${fmtJam(sisa)} Jam lagi — Biar makin puas nontonnya</span>
      <div class="mission-bar"><i style="width:${pct}%"></i></div>
    </div>
    <div class="mission-go">${fmtJam(jam)}/${target} Jam</div>
  </div>`;
}

/* komentar per episode ---------------------------------------------------- */
const epCommentKey = (slug, num) => 'ep:' + slug + ':' + num;

function epCommentPicker(asc, current) {
  if (!asc.length) return '';
  const opts = asc
    .slice()
    .sort((x, y) => x.number - y.number)
    .map((e) => `<option value="${e.number}" ${e.number === current ? 'selected' : ''}>Episode ${e.number}</option>`)
    .join('');
  return `<div class="ep-picker">
    <label for="ep-pick">Diskusi episode:</label>
    <select id="ep-pick">${opts}</select>
  </div>`;
}

// grup 50 episode ala Wibuku: "Semua | 1151-1180 | 1101-1150 | …"
function epGroupChips(asc) {
  const nums = asc.map((e) => e.number);
  const max = nums.length ? nums[nums.length - 1] : 0;
  const size = 50;
  const chips = ['<button class="chip plain ep-chip" data-epg="all">Semua</button>'];
  for (let end = max; end > 0; end -= size) {
    const start = Math.max(1, end - size + 1);
    if (chips.length > 7) break;
    chips.push(`<button class="chip plain ep-chip" data-epg="${start}-${end}">${start} - ${end}</button>`);
  }
  return chips.join('');
}

function chatRow(c) {
  const av = avatarOf(c.name);
  const avHTML = c.picture ? `<img src="${esc(c.picture)}" alt="" />` : esc(av.initial);
  if (c.hidden) {
    return `<div class="chat-row muted"><span class="chat-av">⚑</span>
      <span class="chat-main"><b>Pesan disembunyikan</b><small>Karena banyak laporan.</small></span></div>`;
  }
  return `<div class="chat-row">
    <span class="chat-av av-f${c.ulevel ? frameOf(c.ulevel) : 0}" style="background:${av.color}22;color:${av.color}">${avHTML}</span>
    <span class="chat-main"><b>${esc(c.name)}${c.ulevel ? `<i class="c-lvl">Lvl. ${c.ulevel}</i>` : ''}</b><small>${esc(c.text)}</small></span>
    <span class="chat-time">${esc(timeAgo(c.at))}</span>
  </div>`;
}

async function globalChatCard() {
  let items = [];
  try {
    items = (await api('/api/comments?key=global', { ttl: 15 * 1000 })).items || [];
  } catch {
    items = [];
  }
  const rows = items.slice(-5).reverse().map(chatRow).join('');
  return `<div class="section">
    <div class="section-head"><h2>Global Chat</h2><span class="more" data-nav="chat">Lihat lainnya &gt;</span></div>
    <div class="gchat" id="gchat">${rows || '<div class="empty">Belum ada pesan. Sapa dulu yuk!</div>'}</div>
    <div class="gchat-form">
      <input id="gchat-input" placeholder="Tulis pesan..." maxlength="300" />
      <button class="btn" id="gchat-send">Kirim</button>
    </div>
    <div class="c-note pad">Jangan lupa untuk membuat komentar yang sopan dan santun dan mengikuti Aturan Komunitas kami</div>
  </div>`;
}

function bindGlobalChat() {
  const input = document.getElementById('gchat-input');
  const send = document.getElementById('gchat-send');
  const run = async () => {
    const text = (input?.value || '').trim();
    if (!text) return;
    try {
      const r = await fetch('/api/comments', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ key: 'global', text, name: ME?.name || localStorage.getItem('kelasnime:name') || 'Tamu' }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'gagal');
      input.value = '';
      addExp(5, 'chat');
      const box = document.getElementById('gchat');
      if (box) {
        box.insertAdjacentHTML('afterbegin', chatRow(j.item));
        while (box.children.length > 5) box.lastElementChild.remove();
      }
      toast('Pesan terkirim');
    } catch (e) {
      toast(e.message);
    }
  };
  send?.addEventListener('click', run);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run();
  });
}

/* ------------------------------- GLOBAL CHAT ----------------------------- */
async function viewChat() {
  app.innerHTML = `
    <div class="section">
      <div class="section-head"><h2>Global Chat</h2></div>
    </div>
    ${commentsSection('global', 'Global Chat')}
    <div style="padding:0 16px 20px"><button class="btn ghost" data-nav="home">‹ Kembali ke beranda</button></div>`;
  await loadComments('global');
  bindComments('global', 'Global Chat');
}

/* --------------------------------- HOME ---------------------------------- */
function catalogNav(active = 'home') {
  const tabs = [
    ['home', 'Terbaru'], ['ongoing', 'Ongoing'], ['complete', 'Tamat'], ['schedule', 'Jadwal Rilis'],
  ];
  return `<nav class="catalog-tabs" aria-label="Kategori anime">${tabs.map(([key, label]) =>
    `<button class="catalog-tab ${active === key ? 'active' : ''}" data-nav="${key}">${label}</button>`
  ).join('')}</nav>`;
}
function releaseCard(item) {
  const slug = item.slug || '';
  const ep = item.episode || item.ep || '';
  const title = String(item.title || 'Anime').replace(/\s+episode\s+\d+(?:\.\d+)?\s*$/i, '').trim();
  const status = /complete|finished|tamat/i.test(String(item.status || '')) ? 'Tamat' : (item.status ? 'Ongoing' : 'Anime');
  return `<article class="release-card" data-go="anime" data-slug="${esc(slug)}">
    <div class="release-poster">${img(item.poster, title)}
      ${ep ? `<span class="release-ep">EP ${esc(ep)}</span>` : ''}
      ${item.score ? `<span class="release-score">★ ${esc(item.score)}</span>` : ''}
      <span class="release-status">${status}</span>
    </div>
    <div class="release-copy"><h3>${esc(title)}${ep ? ` <span>Episode ${esc(ep)}</span>` : ''}</h3>
      <div class="release-meta"><span>${esc(item.released || item.date || 'Sub Indo')}</span><b>${noTV(item.type || 'Anime')}</b></div>
    </div>
  </article>`;
}
async function viewHome() {
  app.innerHTML = `${searchBar()}<div class="loader">Memuat beranda…</div>`;
  bindSearch();
  let data;
  try {
    data = await api('/api/home', { ttl: 90 * 1000 });
  } catch (err) {
    app.innerHTML = `${searchBar()}<div class="error-box">Gagal memuat beranda: ${esc(err.message)}</div>`;
    bindSearch();
    return;
  }

  const heroItem = data.airing?.[0] || data.popular?.[0] || null;
  const hero = heroItem
    ? `<div class="hero" data-go="meta" data-id="${heroItem.id}"
         style="background-image:url('${esc(heroItem.banner || heroItem.poster)}')">
          <div class="hero-info">
            <div class="hero-title">${esc(heroItem.title)}</div>
            <div class="hero-meta">
              <span>★ ${heroItem.score ?? '-'}</span><span>${esc(noTV(heroItem.type))}</span>
              <span>${esc(heroItem.status || '')}</span><span>${heroItem.episodes ? heroItem.episodes + ' ep' : ''}</span>
            </div>
            <div class="hero-cta">
              <button class="btn ghost" data-hero="info" data-id="${heroItem.id}">Lihat Info</button>
              <button class="btn" data-hero="tonton" data-title="${esc(heroItem.title)}">▶ Tonton</button>
            </div>
          </div>
       </div>`
    : '';

  const hist = getHistory().slice(0, 8);
  const histSection = hist.length
    ? section(
        'Lanjutkan Nonton',
        hscroll(
          hist.map((x) => ({
            title: x.title,
            slug: x.slug,
            poster: x.poster,
            status: `Lanjut EP ${x.number}`,
            score: '',
          })),
          streamCard
        )
      )
    : '';

  const board = await api('/api/leaderboard', { ttl: 60 * 1000 }).catch(() => ({ items: [] }));
  const rankList = (board.items || []).slice(0, 5);
  const rankSection = rankList.length
    ? section(
        'TOP NAKAMA',
        `<div class="ranks">${rankList
          .map((u, i) => {
            const av = avatarOf(u.name);
            const L = levelOf(u.exp || 0);
            const medal = ['🥇', '🥈', '🥉'][i] || '';
            return `<div class="rank-row ${i === 0 ? 'top' : ''}">
              <span class="rank-no">${medal || i + 1}</span>
              <span class="rank-av av-f${frameOf(L.level)}" style="background:${av.color}22;color:${av.color}">${
              u.picture ? `<img src="${esc(u.picture)}" alt="" />` : esc(av.initial)
            }</span>
              <span class="rank-main"><b>${esc(u.name)}</b><small><span class="rank-title">${esc(
              u.title || titleOf(L.level)
            )}</span> · Lvl. ${L.level} · ${L.exp} EXP${u.clan ? ' · ' + esc(u.clan) : ''}</small></span>
              <span class="rank-exp">${L.exp}</span>
            </div>`;
          })
          .join('')}</div>`
      )
    : section(
        'TOP NAKAMA',
        `<div class="notice">Belum ada yang masuk peringkat. ${
          ME?.sub ? 'Kumpulkan EXP dengan nonton & berkomentar!' : 'Masuk dengan Google untuk ikut papan peringkat.'
        }</div>`
      );

  const genreChips = data.genres?.length
    ? `<div class="section"><div class="section-head"><h2>Jelajahi Genre</h2></div>
        <div class="chips">${data.genres
          .slice(0, 18)
          .map((g) => `<button class="chip" data-go="genre" data-id="${g.id}" data-name="${esc(g.name)}">${esc(g.name)}</button>`)
          .join('')}</div></div>`
    : '';

  const chatCard = await globalChatCard();

  const latestItems = (data.latest || []).slice(0, 16);
  app.innerHTML = `
    ${searchBar()}
    ${catalogNav('home')}
    <section class="release-section">
      <div class="release-heading"><div><p class="release-kicker">Katalog anime</p><h1>Rilis Terbaru <span>(${latestItems.length})</span></h1></div><button class="neo-link" data-nav="ongoing">Lihat semua ↗</button></div>
      ${latestItems.length
        ? `<div class="release-grid">${latestItems.slice(0, 24).map(releaseCard).join('')}</div>`
        : `<div class="notice">Daftar rilisan belum tersedia. Coba muat ulang sebentar lagi.</div>`}
    </section>
    ${histSection}
    ${accCard()}
    ${rankSection}
    ${chatCard}
    <div id="home-rekom"></div>`;

  bindSearch();
  bindGlobalChat();

  // bagian bawah dimuat belakangan supaya beranda langsung tampil & tidak patah-patah
  setTimeout(() => isiBeranda(), 30);
  document.getElementById('home-checkin')?.addEventListener('click', checkIn);

  badge.textContent = 'real-time';
  badge.title = 'Data diambil langsung dari sumber saat ini';
}

/* ------------------------------ KATALOG STATUS --------------------------- */
async function viewCatalog(status = 'ongoing', page = 1) {
  const complete = status === 'complete';
  const label = complete ? 'Anime Tamat' : 'Anime Ongoing';
  app.innerHTML = `${searchBar()}${catalogNav(complete ? 'complete' : 'ongoing')}<div class="loader">Memuat ${label.toLowerCase()}…</div>`;
  bindSearch();
  try {
    const d = await api(`/api/catalog?status=${complete ? 'complete' : 'ongoing'}&page=${page}`, { ttl: 5 * 60 * 1000 });
    const items = d.data || [];
    app.innerHTML = `${searchBar()}${catalogNav(complete ? 'complete' : 'ongoing')}
      <div class="release-heading"><div><p class="release-kicker">Katalog</p><h1>${label} <span>(${items.length})</span></h1></div><span class="neo-page-index">${page}</span></div>
      ${items.length ? `<div class="release-grid">${items.map(releaseCard).join('')}</div>` : `<div class="notice">Daftar ini sedang tidak tersedia.</div>`}
      <div class="catalog-pagination">${page > 1 ? `<button class="neo-link" id="catalog-prev">← Sebelumnya</button>` : ''}<button class="neo-link" id="catalog-next">Berikutnya →</button></div>`;
    bindSearch();
    document.getElementById('catalog-prev')?.addEventListener('click', () => viewCatalog(status, page - 1));
    document.getElementById('catalog-next')?.addEventListener('click', () => viewCatalog(status, page + 1));
  } catch (err) {
    app.innerHTML = `${searchBar()}${catalogNav(complete ? 'complete' : 'ongoing')}<div class="error-box">${esc(err.message)}</div>`;
    bindSearch();
  }
}

/* ------------------------------ ONGOING/MOVIE ---------------------------- */
async function viewOngoing(page = 1) {
  app.innerHTML = `${searchBar()}<div class="loader">Memuat rilisan terbaru…</div>`;
  bindSearch();
  let home = null;
  let latest = null;
  try {
    [home, latest] = await Promise.all([
      api('/api/home', { ttl: 60 * 1000 }).catch(() => null),
      api(`/api/latest?page=${page}`, { ttl: 60 * 1000 }),
    ]);
  } catch (err) {
    app.innerHTML = `${searchBar()}<div class="error-box">${esc(err.message)}</div>`;
    bindSearch();
    return;
  }

  const hist = getHistory().slice(0, 8);
  const histSection = hist.length
    ? section(
        'Lanjutkan Nonton',
        hscroll(hist.map((x) => ({ title: x.title, slug: x.slug, poster: x.poster, status: `Lanjut EP ${x.number}`, score: '' })), streamCard)
      )
    : '';

  const genreChips = home?.genres?.length
    ? `<div class="section"><div class="section-head"><h2>Jelajahi Genre</h2></div>
        <div class="chips">${home.genres.slice(0, 18).map((g) => `<button class="chip" data-go="genre" data-id="${g.id}" data-name="${esc(g.name)}">${esc(g.name)}</button>`).join('')}</div></div>`
    : '';

  app.innerHTML = `
    ${searchBar()}
    ${catalogNav('ongoing')}
    <div class="release-heading"><div><p class="release-kicker">Jelajahi</p><h1>Anime Terbaru <span>(${(latest?.data || []).length})</span></h1></div></div>
    ${histSection}
    ${genreChips}
    <div class="release-grid" style="margin:4px 16px 0">${(latest?.data || []).map(releaseCard).join('')}</div>
    <div style="display:flex;gap:10px;padding:16px">
      ${page > 1 ? `<button class="btn ghost" id="prev-page">‹ Sebelumnya</button>` : ''}
      <button class="btn" id="next-page">Selanjutnya ›</button>
    </div>
    ${home?.airing?.length ? section('Sedang Tayang', hscroll(home.airing, metaCard)) : ''}
    ${home?.popular?.length ? section('Paling Populer', `<div class="grid">${home.popular.slice(0, 9).map(metaCard).join('')}</div>`) : ''}
    ${home?.movies?.length ? section('Movie', hscroll(home.movies, metaCard), 'movies') : ''}`;

  bindSearch();
  $('#next-page')?.addEventListener('click', () => viewOngoing(page + 1));
  $('#prev-page')?.addEventListener('click', () => viewOngoing(page - 1));
}

async function viewMovies() {
  app.innerHTML = `<div class="loader">Memuat anime movie…</div>`;
  try {
    const d = await api('/api/meta/top?type=movie&filter=bypopularity&limit=24', { ttl: 30 * 60 * 1000 });
    app.innerHTML = `
      <div style="padding:14px 16px 0;font-size:16px;font-weight:700">Anime Movie</div>
      <div class="grid" style="margin-top:12px">${(d.items || []).map(metaCard).join('')}</div>`;
  } catch (err) {
    app.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
  }
}

/* -------------------------------- JADWAL --------------------------------- */
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_ID = { monday: 'Senin', tuesday: 'Selasa', wednesday: 'Rabu', thursday: 'Kamis', friday: 'Jumat', saturday: 'Sabtu', sunday: 'Minggu' };

async function viewSchedule(day) {
  const todayIdx = new Date().getDay();
  const active = day || DAYS[(todayIdx + 6) % 7];
  app.innerHTML = `<div class="loader">Memuat jadwal…</div>`;
  try {
    const d = await api(`/api/meta/schedule?day=${active}`, { ttl: 60 * 60 * 1000 });
    app.innerHTML = `
      <div style="padding:14px 16px 0;font-size:16px;font-weight:700">Jadwal Rilis</div>
      <div class="chips" style="margin:10px 0 6px">
        ${DAYS.map((x) => `<button class="chip ${x === active ? 'active' : ''}" data-day="${x}">${DAY_ID[x]}</button>`).join('')}
      </div>
      <div class="grid" style="margin-top:10px">${(d.items || []).map(metaCard).join('') || '<div class="empty">Tidak ada jadwal.</div>'}</div>`;
    app.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => viewSchedule(b.dataset.day)));
  } catch (err) {
    app.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
  }
}

/* --------------------------------- CARI ---------------------------------- */
async function viewSearch(q) {
  app.innerHTML = `${searchBar(q)}<div class="loader">Mencari “${esc(q)}”…</div>`;
  bindSearch();
  if (!q) return;
  let d;
  try {
    d = await api(`/api/search?q=${encodeURIComponent(q)}`, { ttl: 3 * 60 * 1000 });
  } catch (err) {
    app.innerHTML = `${searchBar(q)}<div class="error-box">${esc(err.message)}</div>`;
    bindSearch();
    return;
  }
  const stream = d.stream || [];
  const info = (d.info || []).filter((x) => !stream.some((s) => s.title?.toLowerCase() === x.title?.toLowerCase()));
  app.innerHTML = `
    ${searchBar(q)}
    ${stream.length ? section('Bisa Ditonton', hscroll(stream, streamCard)) : ''}
    ${info.length ? section('Info Anime', `<div class="grid">${info.map(metaCard).join('')}</div>`) : ''}
    ${
      !stream.length && !info.length
        ? `<div class="empty">Tidak ada hasil untuk “${esc(q)}”.<br/>Coba kata kunci lain.</div>`
        : ''
    }`;
  bindSearch();
}

/* ------------------------- DETAIL ANIME (streaming) ----------------------- */
function statusLabel(status = '') {
  const s = String(status).toLowerCase();
  if (s.includes('completed') || s.includes('finished') || s.includes('tamat')) return { text: 'Tamat', cls: 'done' };
  if (s.includes('ongoing') || s.includes('airing') || s.includes('releasing')) return { text: 'Ongoing', cls: 'live' };
  if (s.includes('not yet')) return { text: 'Belum Tayang', cls: '' };
  if (s.includes('upcoming')) return { text: 'Akan Tayang', cls: '' };
  if (s.includes('hiatus')) return { text: 'Hiatus', cls: '' };
  return status ? { text: status, cls: '' } : null;
}

async function viewAnime(slug) {
  app.innerHTML = `<div class="loader">Memuat detail anime…</div>`;
  let d;
  try {
    d = await api(`/api/anime?slug=${encodeURIComponent(slug)}`, { ttl: 5 * 60 * 1000 });
  } catch (err) {
    app.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    return;
  }
  const a = d.data;
  const m = d.meta;
  const banner = m?.banner || m?.poster || a.poster;
  const poster = a.poster || m?.poster;
  const synopsis = m?.synopsis || a.synopsis || 'Sinopsis belum tersedia.';
  const genres = m?.genres?.length ? m.genres : a.genres || [];
  const info = a.info || {};
  const eps = a.episodes || [];
  const asc = [...eps].sort((x, y) => x.number - y.number);
  const last = lastOf(slug);
  const watchedList = watchedOf(slug);
  const st = statusLabel(m?.status || info.Status || '');
  const total = Number(a.totalEpisodes) || asc.length;
  const done = st?.text === 'Tamat';
  const epTerakhir = last?.number || (asc.length ? asc[asc.length - 1].number : 1);

  const episodeHTML = asc
    .map((e) => {
      const w = watchedList.includes(e.number);
      const cur = last?.number === e.number;
      return `<div class="ep-item ${w ? 'watched' : ''} ${cur ? 'current' : ''}" data-ep="${e.number}" data-e="${esc(e.e)}"
                title="${esc(e.title)}">
                <span class="ep-num">${e.number}</span>
                <small>${esc((e.date || '').slice(0, 11))}</small>
              </div>`;
    })
    .join('');

  const related = [
    ...(a.relations || []).map((r) => ({
      kind: 'meta',
      id: r.id,
      title: r.title,
      poster: r.poster,
      rel: String(r.rel || '').toUpperCase(),
      badge: seasonOf(r.title) || REL_ID[String(r.rel || '').toUpperCase()] || '',
      sub: noTV(r.type),
    })),
    ...(m?.relations || []).slice(0, 10).map((r) => ({
      kind: 'meta',
      id: r.id || 'mal' + r.malId,
      title: r.title,
      poster: r.poster,
      rel: String(r.relation || '').toUpperCase(),
      badge: seasonOf(r.title) || REL_ID[String(r.relation).toUpperCase()] || '',
      sub: noTV(r.type),
    })),
  ];

  // gabungkan relasi sumber + relasi metadata: kalau judulnya sama, versi yang
  // punya keterangan lebih jelas (S2/S3, sekuel, prekuel) yang dipakai
  const judulKunci = String(a.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const mutu = (x) => (/^S\d+$/.test(x.badge) ? 2 : 0) + (SERI_REL.has(x.rel) ? 1 : 0);
  const petaRel = new Map();
  for (const r of related) {
    if (!r.title) continue;
    const k = String(r.title).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!k || k === judulKunci) continue;
    const lama = petaRel.get(k);
    if (!lama) petaRel.set(k, r);
    else if (mutu(r) > mutu(lama)) petaRel.set(k, r);
  }
  const relatedUnik = [...petaRel.values()];
  // "Anime Terkait" muncul hanya kalau anime ini memang punya season lanjutan
  // (S2 ke atas). Kalau tidak ada S2/S3, bagian itu tidak ditampilkan.
  // "Anime Terkait" hanya diisi lanjutan satu seri (S2/S3, sekuel, prekuel).
  // Kalau anime ini tidak punya lanjutan, bagian itu tidak ditampilkan sama sekali.
  const relatedTampil = relatedUnik.filter((r) => /^S\d+$/.test(r.badge) || SERI_REL.has(r.rel));

  app.innerHTML = `
    <div class="detail-hero" style="background-image:url('${esc(banner)}')"></div>
    <div class="detail-head">
      ${img(poster, a.title).replace('<img', '<img class="poster"')}
      <div class="info">
        <h1>${esc(a.title)}</h1>
        ${m && m.title !== a.title ? `<div class="alt">${esc(m.title)}</div>` : ''}
        <div class="meta">
          ${st ? `<span class="pill ${st.cls}">${esc(st.text)}</span>` : ''}
          ${m?.score ? `<span class="pill score">★ ${m.score}</span>` : ''}
          ${info.Type ? `<span class="pill">${esc(noTV(info.Type))}</span>` : ''}
          ${total ? `<span class="pill">${total} Episode</span>` : ''}
          ${m?.year ? `<span class="pill">${esc(m.year)}</span>` : ''}
          <span class="pill" id="diputar" hidden></span>
        </div>
      </div>
    </div>

    <div class="detail-actions">
      ${
        asc.length
          ? `<button class="btn" id="play-first">${last ? `▶ Lanjut EP ${last.number}` : '▶ Mulai Nonton'}</button>
             <button class="btn ghost" id="play-last">EP ${asc[asc.length - 1].number}</button>
             ${tombolSub(a)}`
          : tombolSub(a)
      }
    </div>

    <div class="synopsis clamp" id="synopsis">${esc(synopsis)}</div>
    <div class="synopsis-toggle" id="syn-toggle">Selengkapnya</div>

    ${genres.length ? `<div class="chips" style="margin-top:8px">${genres.map((g) => `<span class="chip plain">${esc(g)}</span>`).join('')}</div>` : ''}

    <div class="section">
      <div class="section-head">
        <h2>Episode <span class="ep-range">(${asc.length ? asc[asc.length - 1].number : 0})${done ? ' · Tamat' : ''}</span></h2>
        ${asc.length ? `<span class="more" id="sort-ep">Urut: 1 → Akhir</span>` : ''}
      </div>
      ${
        asc.length
          ? `<div class="ep-groups" id="ep-groups">${epGroupChips(asc)}</div>
             <div class="ep-toolbar">
               <input id="ep-filter" placeholder="Cari nomor episode…" />
               <span class="ep-progress">${watchedList.length}/${asc.length} ditonton</span>
             </div>
             <div class="ep-list" id="ep-list">${episodeHTML}</div>`
          : `<div class="empty">Belum ada episode untuk judul ini.</div>`
      }
    </div>

    ${
      relatedTampil.length
        ? section('Anime Terkait', hscroll(relatedTampil, relatedCard))
        : ''
    }

    <div class="c-note pad">Komentar ada di tiap episode — buka salah satu episode untuk berdiskusi.</div>`;

  // jumlah putar: diambil terpisah supaya halaman cepat tampil
  if (slug) api(`/api/views?slug=${encodeURIComponent(slug)}`, { ttl: 60 * 1000 })
    .then((v) => {
      const n = Number(v.views || 0);
      const el = $('#diputar');
      if (el && n > 0) {
        el.textContent = (n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'K' : n) + ' kali diputar';
        el.hidden = false;
      }
    })
    .catch(() => {});



  const syn = $('#synopsis');
  $('#syn-toggle')?.addEventListener('click', () => {
    syn.classList.toggle('clamp');
    $('#syn-toggle').textContent = syn.classList.contains('clamp') ? 'Selengkapnya' : 'Sembunyikan';
  });

  bindEpGroups(asc);

  let ascending = true;
  const listEl = $('#ep-list');
  const reorder = () => {
    const items = [...listEl.children];
    items.sort((x, y) => (ascending ? 1 : -1) * (Number(x.dataset.ep) - Number(y.dataset.ep)));
    items.forEach((el) => listEl.appendChild(el));
    $('#sort-ep').textContent = ascending ? 'Urut: 1 → Akhir' : 'Urut: Akhir → 1';
  };
  $('#sort-ep')?.addEventListener('click', () => {
    ascending = !ascending;
    reorder();
  });

  const goWatch = (n) => {
    const ep = asc.find((e) => e.number === n) || asc[0];
    location.hash = `#/watch?slug=${encodeURIComponent(slug)}&num=${ep.number}&e=${encodeURIComponent(
      ep.e
    )}&title=${encodeURIComponent(a.title)}&poster=${encodeURIComponent(poster)}`;
  };
  $('#play-first')?.addEventListener('click', () => goWatch(last ? last.number : asc[0]?.number));

  $('#btn-sub')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const aktif = await toggleSub({ slug: a.slug, title: a.title, poster: a.poster, type: noTV(a.info?.Tipe || '') });
    btn.textContent = aktif ? '🔖 Disimpan' : '🔖 Simpan';
    toast(aktif ? 'Ditambahkan ke Subscribe' : 'Dihapus dari Subscribe');
  });
  $('#play-last')?.addEventListener('click', () => goWatch(asc[asc.length - 1]?.number));

  const filter = $('#ep-filter');
  filter?.addEventListener('input', () => {
    const v = filter.value.trim();
    listEl.querySelectorAll('.ep-item').forEach((el) => {
      el.style.display = !v || String(el.dataset.ep).includes(v) ? '' : 'none';
    });
  });
  listEl?.querySelectorAll('.ep-item').forEach((el) =>
    el.addEventListener('click', () => goWatch(Number(el.dataset.ep)))
  );
  if (last) {
    const el = listEl?.querySelector('.ep-item.current');
    if (el) setTimeout(() => el.scrollIntoView({ block: 'center' }), 300);
  }

  // komentar per episode dipasang di halaman nonton
}

/* --------------------------- DETAIL METADATA ----------------------------- */
async function viewMeta(id) {
  app.innerHTML = `<div class="loader">Memuat info anime…</div>`;
  let d;
  try {
    d = await api(`/api/meta/anime/${encodeURIComponent(id)}`, { ttl: 30 * 60 * 1000 });
  } catch (err) {
    app.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    return;
  }
  const m = d.item;
  if (!m) {
    app.innerHTML = `<div class="empty">Data tidak ditemukan.</div>`;
    return;
  }
  const st = statusLabel(m.status || '');
  // relasi dikelompokkan: "Anime Terkait" hanya tampil kalau ada season lanjutan (S2+)
  const relSemua = (m.relations || [])
    .filter((r) => r && r.title)
    .map((r) => ({
      kind: 'meta',
      id: r.id || 'mal' + r.malId,
      title: r.title,
      poster: r.poster,
      rel: String(r.relation || '').toUpperCase(),
      badge: seasonOf(r.title) || REL_ID[String(r.relation || '').toUpperCase()] || '',
      sub: noTV(r.type),
    }));
  const relTampil = relSemua.filter((r) => /^S\d+$/.test(r.badge) || SERI_REL.has(r.rel));

  app.innerHTML = `
    <div class="detail-hero" style="background-image:url('${esc(m.banner || m.poster)}')"></div>
    <div class="detail-head">
      ${img(m.poster, m.title).replace('<img', '<img class="poster"')}
      <div class="info">
        <h1>${esc(m.title)}</h1>
        ${m.titleEnglish && m.titleEnglish !== m.title ? `<div class="alt">${esc(m.titleEnglish)}</div>` : ''}
        <div class="meta">
          ${st ? `<span class="pill ${st.cls}">${esc(st.text)}</span>` : ''}
          ${m.score ? `<span class="pill score">★ ${m.score}</span>` : ''}
          ${noTV(m.type) ? `<span class="pill">${esc(noTV(m.type))}</span>` : ''}
          ${m.episodes ? `<span class="pill">${m.episodes} Episode</span>` : ''}
          ${m.year ? `<span class="pill">${esc(m.year)}</span>` : ''}
        </div>
      </div>
    </div>

    <div class="detail-actions">
      <button class="btn" id="play-meta" disabled>▶ Memuat episode…</button>
    </div>

    <div class="synopsis clamp" id="synopsis">${esc(m.synopsis || 'Sinopsis belum tersedia.')}</div>
    <div class="synopsis-toggle" id="syn-toggle">Selengkapnya</div>

    <div class="chips" style="margin-top:8px">${(m.genres || []).map((g) => `<span class="chip plain">${esc(g)}</span>`).join('')}</div>

    <div class="section" id="ep-meta" hidden>
      <div class="section-head">
        <h2>Episode <span class="ep-range" id="ep-meta-n"></span></h2>
        <span class="more" id="ep-meta-semua">Semua &gt;</span>
      </div>
      <div class="ep-list" id="ep-meta-list"></div>
    </div>

    ${
      m.studios?.length || m.duration
        ? `<div class="rows">
            ${m.studios?.length ? `<div class="row"><div><div class="r-title">Studio</div><div class="r-sub">${esc(m.studios.join(', '))}</div></div></div>` : ''}
            ${m.duration ? `<div class="row"><div><div class="r-title">Durasi</div><div class="r-sub">${esc(m.duration)}</div></div></div>` : ''}
          </div>`
        : ''
    }

    ${relTampil.length ? section('Anime Terkait', hscroll(relTampil.slice(0, 12), relatedCard)) : ''}

    ${
      (m.recommendations || []).length
        ? section(
            'Rekomendasi',
            hscroll(
              (m.recommendations || []).slice(0, 10).map((r) => ({
                id: r.id,
                title: r.title,
                poster: r.poster,
                type: r.type,
                episodes: null,
                score: r.score,
              })),
              metaCard
            )
          )
        : ''
    }

    ${commentsSection('meta:' + id, m.title)}`;

  const syn = $('#synopsis');
  $('#syn-toggle')?.addEventListener('click', () => {
    syn.classList.toggle('clamp');
    $('#syn-toggle').textContent = syn.classList.contains('clamp') ? 'Selengkapnya' : 'Sembunyikan';
  });

  // komentar hanya untuk tiap episode, jadi tidak dipasang di sini

  // Episode 1 -> tamat langsung siap diputar di halaman ini (tanpa tombol
  // "cari episode"). Padanan judul dicari otomatis, lalu daftarnya ditampilkan.
  (async () => {
    const btn = $('#play-meta');
    const sec = $('#ep-meta');
    const slugA = await slugStream(m.title);
    if (!slugA) {
      if (btn) { btn.textContent = '▶ Belum ada sumber'; btn.disabled = true; }
      return;
    }
    let a = null;
    try {
      const d = await api(`/api/anime?slug=${encodeURIComponent(slugA)}`, { ttl: 5 * 60 * 1000 });
      a = d.data;
    } catch (err) {
      if (btn) btn.textContent = '▶ Coba lagi';
      toast(err.message);
      return;
    }
    const eps = (a?.episodes || []).slice().sort((x, y) => x.number - y.number);
    if (!eps.length) {
      if (btn) { btn.textContent = '▶ Belum ada episode'; btn.disabled = true; }
      return;
    }
    const judulA = a.title || m.title;
    const posterA = a.poster || m.poster || '';
    const buka = (n) => {
      const ep = eps.find((e) => Number(e.number) === Number(n)) || eps[0];
      location.hash = `#/watch?slug=${encodeURIComponent(a.slug || slugA)}&num=${ep.number}&e=${encodeURIComponent(
        ep.e || ''
      )}&title=${encodeURIComponent(judulA)}&poster=${encodeURIComponent(posterA)}`;
    };
    const riw = lastOf(slugA);
    const mulai = riw?.number && eps.some((e) => Number(e.number) === Number(riw.number)) ? riw.number : eps[0].number;
    if (btn) {
      btn.disabled = false;
      btn.textContent = `▶ ${riw?.number ? 'Lanjut EP ' + mulai : 'Tonton EP ' + mulai}`;
      btn.onclick = () => buka(mulai);
    }
    if (sec) {
      sec.hidden = false;
      const nl = $('#ep-meta-n');
      if (nl) nl.textContent = '(' + eps[eps.length - 1].number + ')';
      const sem = $('#ep-meta-semua');
      if (sem) sem.onclick = () => { location.hash = `#/anime/${encodeURIComponent(a.slug || slugA)}`; };
      const list = $('#ep-meta-list');
      list.innerHTML = eps
        .map(
          (e) =>
            `<div class="ep-item" data-n="${e.number}"><span class="ep-num">${e.number}</span><small>${esc(
              (e.date || '').slice(0, 11)
            )}</small></div>`
        )
        .join('');
      list.querySelectorAll('.ep-item').forEach((el) =>
        el.addEventListener('click', () => buka(Number(el.dataset.n)))
      );
    }
  })();
}

/* --------------------------------- GENRE --------------------------------- */
async function viewGenre(id, name) {
  app.innerHTML = `<div class="loader">Memuat genre ${esc(name || '')}…</div>`;
  try {
    const d = await api(`/api/meta/genre/${id}`, { ttl: 30 * 60 * 1000 });
    app.innerHTML = `
      <div style="padding:14px 16px 0;font-size:16px;font-weight:700">Genre: ${esc(name || id)}</div>
      <div class="grid" style="margin-top:12px">${(d.items || []).map(metaCard).join('') || '<div class="empty">Kosong.</div>'}</div>`;
  } catch (err) {
    app.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
  }
}

/* --------------------------------- WATCH --------------------------------- */
let watchState = { servers: [], index: 0, params: {}, tried: new Set(), data: null };

async function viewWatch(params) {
  const { slug, num, e, title, poster } = params;
  app.innerHTML = `
    <div class="player-wrap"><div class="player-frame" id="frame"><div class="player-overlay">Menyiapkan pemutar…</div></div></div>
    <div class="watch-actions" id="actions">
      <button class="act" id="a-toggle" title="Putar / Jeda">&#9655;</button>
      <button class="act" id="a-back" title="Mundur 10 detik">&#171;10s</button>
      <button class="act" id="a-fwd" title="Maju 10 detik">10s&#187;</button>
      <button class="act" id="a-fs" title="Layar penuh (miring)">&#9974;</button>
      <button class="act" id="a-like" title="Suka">&#9829; <span id="like-n">0</span></button>
      <button class="act" id="a-share" title="Bagikan tautan">Bagikan</button>
      <button class="act" id="a-auto" title="Putar episode berikutnya otomatis">Autoplay</button>
    </div>
    <div class="server-row" id="servers"></div>
    <div class="watch-head"><h1>${esc(title || 'Memuat…')}</h1>
      <div class="sub">Episode ${esc(num || '?')} · <span id="view-n">0</span> kali diputar</div></div>

    <div class="section">
      <div class="section-head"><h2>Unduh Episode ${esc(num || '')}</h2></div>
      <div id="watch-download"><div class="empty">Mencari tautan unduhan…</div></div>
    </div>

    <div id="watch-comments"></div>`;

  let data;
  try {
    data = await loadServers(params);
  } catch (err) {
    $('#frame').innerHTML = `<div class="player-overlay">${esc(err.message)}</div>`;
    $('#servers').innerHTML = '';
    return;
  }

  // tautan unduhan untuk episode ini (langsung ditampilkan, tanpa tombol)
  isiUnduhan(params, data);

  // komentar khusus episode ini
  if (slug) {
    const key = epCommentKey(slug, Number(num) || 1);
    const box = document.getElementById('watch-comments');
    if (box) {
      box.innerHTML = commentsSection(key, `${title || 'Anime'} — Episode ${num}`);
      loadComments(key);
      bindComments(key, `${title || 'Anime'} — Episode ${num}`);
    }
  }

  watchState = { servers: data.servers, index: 0, params, tried: new Set(), data };
  renderWatchChrome(data);

  // episode terbaru kadang belum punya server sama sekali → jangan diam di
  // "Menyiapkan pemutar…": beri pesan jelas + tombol cepat ke episode sebelumnya
  if (!watchState.servers.length) {
    const frame = $('#frame');
    if (frame)
      frame.innerHTML =
        '<div class="player-overlay">Server episode ini belum tersedia.<br><small>Biasanya episode sebelumnya sudah bisa diputar.</small></div>';
    const row = $('#reload-player')?.parentElement;
    if (row && !$('#coba-prev')) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.id = 'coba-prev';
      b.textContent = 'Coba episode sebelumnya';
      b.addEventListener('click', () => jumpEpisode(-1));
      row.appendChild(b);
    }
  }
  bindWatchActions(params, data);
  countView(params);

  if (slug) {
    saveHistory({
      slug,
      title: title || data.title || '',
      poster: poster || '',
      number: Number(num) || 1,
      at: Date.now(),
    });
    markWatched(slug, Number(num) || 1);
  }

  if (!watchState.servers.length) {
    $('#frame').innerHTML = `<div class="player-overlay">Belum ada server untuk episode ini.</div>`;
    return;
  }
  const lastOk = localStorage.getItem('kelasnime:lastworking');
  let start = watchState.servers.findIndex((s) => s.label === lastOk);
  if (start < 0) start = 0;
  playServer(start);
}

// bagian "Unduh Episode N" di halaman nonton: utamakan berkas langsung (MP4),
// kalau tidak ada tampilkan tautan dari sumber unduhan
async function isiUnduhan(params, data) {
  const box = document.getElementById('watch-download');
  if (!box) return;

  const link = (teks, href, langsung) =>
    `<a class="dl-link${langsung ? ' direct' : ''}" href="${esc(href)}" ${
      langsung ? 'download' : 'target="_blank" rel="noopener noreferrer"'
    }>${esc(teks)}${langsung ? ' ⬇' : ' ↗'}</a>`;

  const berkas = (data?.servers || []).filter((x) => x.type === 'mp4');
  let html = '';
  if (berkas.length) {
    html += `<div class="dl-group"><div class="dl-q">Berkas langsung</div><div class="dl-links">${berkas
      .map((x, i) =>
        link(
          berkas.length > 1 ? `MP4 ${i + 1}` : 'Unduh MP4',
          `/api/dlmp4?e=${encodeURIComponent(params.e || '')}&n=${x.n}&slug=${encodeURIComponent(
            params.slug || ''
          )}&num=${encodeURIComponent(params.num || '')}`,
          true
        )
      )
      .join('')}</div></div>`;
  }

  try {
    const d = await api(`/api/downloads?q=${encodeURIComponent(params.title || '')}`, { ttl: 10 * 60 * 1000 });
    const grup = d.groups || [];
    if (grup.length) {
      html += grup
        .slice(0, 4)
        .map(
          (g) =>
            `<div class="dl-group"><div class="dl-q">${esc(g.quality)}</div><div class="dl-links">${g.links
              .slice(0, 6)
              .map((l) => link(l.host, l.url, l.direct))
              .join('')}</div></div>`
        )
        .join('');
      if (grup.length > 4) html += `<div class="dl-note">${grup.length - 4} paket lain tersedia di sumber unduhan.</div>`;
    }
  } catch {
    /* biarkan: berkas langsung saja */
  }

  box.innerHTML =
    html ||
    `<div class="empty">Belum ada tautan unduhan untuk episode ini. Coba episode lain atau gunakan tombol Bagikan.</div>`;
}

/* ------------------------------ BERANDA BAWAH ------------------------------ */
// Rekomendasi + rilisan terbaru: diambil setelah halaman tampil biar mulus
async function isiBeranda() {
  const rekom = document.getElementById('home-rekom');
  const terbaru = document.getElementById('home-terbaru');
  if (!rekom) return;

  rekom.innerHTML = `<div class="section-head"><h2>Rekomendasi Anime</h2></div><div class="loader">Memuat…</div>`;
  if (terbaru) terbaru.innerHTML = `<div class="section-head"><h2>Anime Terbaru</h2></div><div class="loader">Memuat…</div>`;

  // ambil sekali dari /api/home (sama dengan permintaan beranda → ikut cache),
  // supaya dua bagian bawah ini tidak bergantung pada permintaan kedua
  const home = await api('/api/home', { ttl: 90 * 1000 }).catch(() => null);
  const rekomHasil = [...(home?.airing || []), ...(home?.popular || []), ...(home?.upcoming || [])]
    .filter((x, i, arr) => x && arr.findIndex((y) => y.id === x.id) === i)
    .slice(0, 12);
  rekom.innerHTML = rekomHasil.length
    ? section('Rekomendasi Anime', hscroll(rekomHasil, metaCard))
    : `<div class="section-head"><h2>Rekomendasi Anime</h2></div><div class="notice">Rekomendasi belum tersedia, coba muat ulang.</div>`;

  let terbaruHasil = home || null;
  let items = terbaruHasil?.latest || [];
  if (!items.length) {
    // cadangan: minta langsung rilisan terbaru (dengan lapisan cadangan server)
    terbaruHasil = await api('/api/latest?page=1', { ttl: 2 * 60 * 1000 }).catch(() => null);
    items = terbaruHasil?.data || terbaruHasil?.items || [];
  }
  if (terbaru) terbaru.innerHTML = items.length
    ? catatanStale(terbaruHasil) + section('Anime Terbaru', hscroll(items.slice(0, 12), streamCard))
    : `<div class="section-head"><h2>Anime Terbaru</h2></div><div class="notice">Rilisan terbaru belum tersedia, coba muat ulang.</div>`;
}

/* --------------------------- RIWAYAT & SUBSCRIBE --------------------------- */
async function viewRiwayat() {
  const hist = getHistory();
  app.innerHTML = `
    <div class="section-head"><h2>Riwayat Menonton</h2></div>
    ${
      hist.length
        ? `<div class="grid">${hist
            .map(
              (x) => `<div class="card" data-go="anime" data-slug="${esc(x.slug)}">
              <div class="thumb">${img(x.poster, x.title)}${
                x.number ? `<span class="badge eps">Lanjut EP ${x.number}</span>` : ''
              }</div>
              <div class="title">${esc(x.title)}</div>
              <div class="sub">${esc(x.watchedAt ? new Date(x.watchedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '')}</div>
            </div>`
            )
            .join('')}</div>
          <div class="section"><button class="btn ghost" id="clear-hist">Kosongkan Riwayat</button></div>`
        : `<div class="empty">Belum ada riwayat. Mulai nonton dari beranda atau jadwal tayang.</div>`
    }`;
  badge.textContent = 'perangkat';
  document.getElementById('clear-hist')?.addEventListener('click', () => {
    localStorage.removeItem(HIST);
    viewRiwayat();
  });
}

async function viewSubs() {
  app.innerHTML = `
    <div class="section-head"><h2>Subscribed Anime</h2></div>
    <div class="loader">Memuat daftar…</div>`;
  const daftar = await getSubs();
  app.innerHTML = `
    <div class="section-head"><h2>Subscribed Anime</h2>
      <small style="opacity:.7">${daftar.length} judul${ME?.sub ? '' : ' · tersimpan di perangkat'}</small></div>
    ${
      daftar.length
        ? `<div class="grid">${daftar
            .map(
              (x) => `<div class="card" data-go="anime" data-slug="${esc(x.slug)}">
              <div class="thumb">${img(x.poster, x.title)}
                <button class="badge eps hapus-sub" data-unsub="${esc(x.slug)}" title="Berhenti subscribe">✕</button>
              </div>
              <div class="title">${esc(x.title)}</div>
              <div class="sub">${esc(x.type || '')}</div>
            </div>`
            )
            .join('')}</div>`
        : `<div class="empty">Belum ada anime yang di-subscribe. Tekan 🔖 Simpan di halaman anime favoritmu.</div>`
    }`;
  app.querySelectorAll('[data-unsub]').forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await toggleSub({ slug: b.dataset.unsub }, true);
      viewSubs();
    })
  );
  badge.textContent = ME?.sub ? 'tersinkron' : 'perangkat';
}

// daftar subscribe: dari server kalau sudah masuk, selalu ada salinan di perangkat
async function getSubs() {
  let lokal = readJSON(SUBS, []) || [];
  if (ME?.sub) {
    try {
      const r = await authedFetch('/api/subs');
      const j = await r.json();
      if (j?.ok && Array.isArray(j.items)) {
        lokal = j.items.map((x) => ({ slug: x.slug, title: x.title, poster: x.poster, type: x.type || '' }));
        localStorage.setItem(SUBS, JSON.stringify(lokal));
      }
    } catch {
      /* pakai salinan perangkat */
    }
  }
  return lokal.filter((x) => x && x.slug);
}

async function toggleSub(item, hapus = false) {
  let lokal = readJSON(SUBS, []) || [];
  const ada = lokal.some((x) => x.slug === item.slug);
  const hapusSekarang = hapus || ada;
  lokal = hapusSekarang ? lokal.filter((x) => x.slug !== item.slug) : [item, ...lokal].slice(0, 200);
  localStorage.setItem(SUBS, JSON.stringify(lokal));
  if (ME?.sub) {
    try {
      await authedFetch('/api/subs', {
        method: hapusSekarang ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: item.slug, title: item.title, poster: item.poster, type: item.type || '' }),
      });
    } catch {
      /* tetap tersimpan di perangkat */
    }
  }
  return !hapusSekarang;
}

const isSubscribed = (slug) => (readJSON(SUBS, []) || []).some((x) => x.slug === slug);

// tombol subscribe di halaman anime
function tombolSub(a) {
  const aktif = isSubscribed(a.slug);
  return `<button class="btn ghost" id="btn-sub">${aktif ? '🔖 Disimpan' : '🔖 Simpan'}</button>`;
}

const authedFetch = (url, opt = {}) => fetch(url, { ...opt, headers: authHeaders(opt.headers || {}) });

function sendCmd(action, value) {
  const f = document.getElementById('ply');
  if (!f || !f.contentWindow) return;
  try {
    f.contentWindow.postMessage({ kelasnime: 'cmd', action, value }, '*');
  } catch {
    /* abaikan */
  }
}

const AUTO_KEY = 'kelasnime:autoplay';
const autoOn = () => localStorage.getItem(AUTO_KEY) !== '0';

function bindWatchActions(params, data) {
  const key = 'anime:' + (params.slug || (params.title || '').toLowerCase().replace(/\s+/g, '-'));
  const fsBtn = document.getElementById('a-fs');
  if (fsBtn) fsBtn.addEventListener('click', () => sendCmd('fs'));

  // like
  const btn = document.getElementById('a-like');
  const nEl = document.getElementById('like-n');
  const likedKey = 'kelasnime:liked:' + key;
  let count = 0;
  fetch('/api/like?key=' + encodeURIComponent(key))
    .then((r) => r.json())
    .then((j) => {
      count = j.likes || 0;
      if (nEl) nEl.textContent = count;
      if (localStorage.getItem(likedKey)) btn?.classList.add('on');
    })
    .catch(() => {});
  btn?.addEventListener('click', async () => {
    if (localStorage.getItem(likedKey)) return toast('Kamu sudah menyukai judul ini');
    localStorage.setItem(likedKey, JSON.stringify({ k: key, t: params.title || '', at: Date.now() }));
    btn.classList.add('on');
    if (nEl) nEl.textContent = ++count;
    try {
      const r = await fetch('/api/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const j = await r.json();
      if (j.likes != null && nEl) nEl.textContent = j.likes;
    } catch {
      /* offline: hitungan tetap jalan di layar */
    }
  });

  // bagikan
  document.getElementById('a-share')?.addEventListener('click', () => {
    shareLink(params.title || 'Nonton anime', location.href);
    addExp(5, 'share');
  });

  // kontrol pemutar
  document.getElementById('a-toggle')?.addEventListener('click', () => sendCmd('toggle'));
  document.getElementById('a-back')?.addEventListener('click', () => sendCmd('seek', -10));
  document.getElementById('a-fwd')?.addEventListener('click', () => sendCmd('seek', 10));

  // autoplay
  const auto = document.getElementById('a-auto');
  const paintAuto = () => {
    if (!auto) return;
    auto.classList.toggle('on', autoOn());
    auto.textContent = autoOn() ? 'Autoplay: ON' : 'Autoplay: OFF';
  };
  paintAuto();
  auto?.addEventListener('click', () => {
    localStorage.setItem(AUTO_KEY, autoOn() ? '0' : '1');
    paintAuto();
    toast(autoOn() ? 'Autoplay episode berikutnya: nyala' : 'Autoplay episode berikutnya: mati');
  });

  updateControls();
}

// tombol kontrol cuma jalan untuk server mp4/hls (pemutar kita sendiri)
function updateControls() {
  const s = watchState.servers[watchState.index];
  const can = !!s && (s.type === 'mp4' || s.type === 'hls');
  ['a-toggle', 'a-back', 'a-fwd'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('disabled', !can);
    el.title = can ? el.dataset.tip || el.title : 'Kontrol ini hanya tersedia di server langsung (bukan embed)';
  });
}

async function countView(params) {
  const key = 'view:' + (params.slug || (params.title || '').toLowerCase().replace(/\s+/g, '-')) + ':' + (params.num || 1);
  try {
    const r = await fetch('/api/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const j = await r.json();
    const el = document.getElementById('view-n');
    if (el && j.views) el.textContent = Number(j.views).toLocaleString('id-ID');
  } catch {
    /* abaikan */
  }
}

// Ambil daftar server; kalau token episode kedaluwarsa, minta ulang lewat slug
async function loadServers(params) {
  const minta = (e) =>
    api(
      `/api/episode?e=${encodeURIComponent(e)}&slug=${encodeURIComponent(params.slug || '')}&num=${encodeURIComponent(
        params.num || ''
      )}`,
      { ttl: 15 * 60 * 1000 }
    );

  // token ada → pakai langsung
  if (params.e) {
    try {
      return await minta(params.e);
    } catch (err) {
      // token kedaluwarsa/rusak → cari ulang dari daftar episode
      if (err.status !== 400) throw err;
    }
  }

  // tanpa token (atau token rusak): ambil ulang dari detail anime
  if (params.slug) {
    const d = await api(`/api/anime?slug=${encodeURIComponent(params.slug)}`, { ttl: 60 * 1000 });
    const eps = d.data?.episodes || [];
    const ep = eps.find((x) => String(x.number) === String(params.num)) || eps[eps.length - 1];
    if (ep?.e) {
      params.e = ep.e;
      params.num = ep.number;
      // perbarui hash supaya bisa di-refresh tanpa error
      history.replaceState(
        null,
        '',
        `#/watch?slug=${encodeURIComponent(params.slug)}&num=${ep.number}&e=${encodeURIComponent(
          ep.e
        )}&title=${encodeURIComponent(params.title || '')}&poster=${encodeURIComponent(params.poster || '')}`
      );
      return minta(ep.e);
    }
  }
  throw new Error('Episode tidak ditemukan. Buka halaman animenya lalu pilih episode lagi.');
}

function renderWatchChrome(data) {
  const servers = watchState.servers;
  $('#servers').innerHTML = servers
    .map((s, i) => {
      // 403/429 dari server kami belum tentu berarti mati di browser kamu (blokir IP datacenter)
      const state = s.alive ? 'ok' : s.status === 0 || s.status === 403 || s.status === 429 ? 'unknown' : 'bad';
      return `<button class="server-chip ${i === watchState.index ? 'active' : ''}" data-i="${i}" data-type="${esc(s.type)}"
        title="${state === 'ok' ? 'Server merespon' : state === 'bad' ? 'Tidak merespon' : 'Belum bisa dicek'}">
        <span class="dot ${state}"></span>${esc(s.label)}</button>`;
    })
    .join('');
  $('#servers')
    .querySelectorAll('.server-chip')
    .forEach((b) => b.addEventListener('click', () => playServer(Number(b.dataset.i))));

  $('.watch-head').innerHTML = `
    <h1>${esc(watchState.params.title || data.title || 'Nonton')}</h1>
    <div class="sub">Episode ${esc(watchState.params.num || '?')} · <span id="view-n">0</span> kali diputar</div>`;

  if (!$('#watch-extra')) {
    const extra = document.createElement('div');
    extra.id = 'watch-extra';
    extra.innerHTML = `
      <div class="watch-nav">
        <button class="btn ghost" id="prev-ep">‹ Sebelumnya</button>
        <button class="btn ghost" id="next-ep">Selanjutnya ›</button>
      </div>
      <div class="watch-nav">
        <button class="btn ghost" id="reload-player">Muat ulang pemutar</button>
      </div>
      <div class="hint">Kalau video tidak muncul atau buffering, ganti server di atas.
      Posisi terakhirmu otomatis tersimpan.</div>`;
    $('.watch-head').after(extra);
    $('#prev-ep')?.addEventListener('click', () => jumpEpisode(-1));
    $('#next-ep')?.addEventListener('click', () => jumpEpisode(1));
    $('#reload-player')?.addEventListener('click', () => playServer(watchState.index));
  }
}

function playServer(i) {
  const s = watchState.servers[i];
  if (!s) return;
  watchState.index = i;
  document.querySelectorAll('#servers .server-chip').forEach((b, idx) => b.classList.toggle('active', idx === i));
  const frame = $('#frame');
  const p0 = watchState.params;
  frame.innerHTML = `<iframe id="ply" src="/api/embed?e=${encodeURIComponent(p0.e)}&n=${s.n}&slug=${encodeURIComponent(p0.slug || '')}&num=${encodeURIComponent(p0.num || '')}"
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen scrolling="no" frameborder="0"></iframe>`;
  updateControls();
}

function markServerOk() {
  const s = watchState.servers[watchState.index];
  if (s?.label) localStorage.setItem('kelasnime:lastworking', s.label);
}

function nextServer() {
  const cur = watchState.index;
  watchState.tried.add(cur);
  const next = watchState.servers.findIndex((_, idx) => idx > cur);
  if (next >= 0) {
    toast('Server bermasalah, pindah ke server lain…');
    playServer(next);
  } else if (watchState.servers.length) {
    toast('Semua server dicoba. Coba muat ulang atau episode lain.');
  }
}

// Pemutar (iframe internal) ngasih kabar lewat postMessage
window.addEventListener('message', (ev) => {
  const m = ev?.data;
  if (!m || !m.kelasnime) return;
  if (m.kelasnime === 'error') {
    nextServer();
    return;
  }
  if (m.kelasnime === 'fs-masuk' || m.kelasnime === 'fs-keluar') {
    // dokumen induk ini yang berstatus layar penuh -> di sinilah kunci orientasi
    // diizinkan browser (Android Chrome). Video lalu miring ke landscape.
    try {
      if (m.kelasnime === 'fs-masuk') screen.orientation?.lock?.('landscape')?.catch?.(() => {});
      else screen.orientation?.unlock?.();
    } catch {
      /* desktop / browser tanpa dukungan: abaikan */
    }
    document.body.classList.toggle('fs', m.kelasnime === 'fs-masuk');
    return;
  }
  if (m.kelasnime === 'ok') markServerOk();
  else if (m.kelasnime === 'state') {
    const b = document.getElementById('a-toggle');
    if (b) b.innerHTML = m.playing ? '&#10073;&#10073;' : '&#9655;';
    // mode hemat: saat video berjalan, animasi halaman yang memaksa gambar ulang
    // layar terus-menerus dimatikan supaya streaming mulus di posisi tegak
    document.body.classList.toggle('playing', !!m.playing);
  } else if (m.kelasnime === 'ended') {
    addExp(15, 'watch');
    if (autoOn()) {
      toast('Episode selesai — lanjut ke episode berikutnya');
      jumpEpisode(1);
    }
  }
});

async function jumpEpisode(delta) {
  const { slug, num } = watchState.params;
  if (!slug) {
    toast('Episode ini berdiri sendiri — buka halaman anime untuk navigasi episode.');
    return;
  }
  try {
    const d = await api(`/api/anime?slug=${encodeURIComponent(slug)}`, { ttl: 5 * 60 * 1000 });
    const eps = (d.data?.episodes || []).sort((a, b) => a.number - b.number);
    const cur = Number(num) || 1;
    const target = eps.find((e) => e.number === cur + delta);
    if (!target) {
      toast(delta > 0 ? 'Ini episode terakhir' : 'Ini episode pertama');
      return;
    }
    location.hash = `#/watch?slug=${encodeURIComponent(slug)}&num=${target.number}&e=${encodeURIComponent(
      target.e
    )}&title=${encodeURIComponent(watchState.params.title || '')}&poster=${encodeURIComponent(
      watchState.params.poster || ''
    )}`;
  } catch (err) {
    toast(err.message);
  }
}

/* ---------------------------------- CLAN ---------------------------------- */
async function viewClan(tag = '') {
  app.innerHTML = `<div class="loader">Memuat clan…</div>`;
  let clans = [];
  let detail = null;
  try {
    clans = (await api('/api/clans', { ttl: 30 * 1000 })).items || [];
    if (tag) detail = await api('/api/clan/' + encodeURIComponent(tag), { ttl: 30 * 1000 });
  } catch (err) {
    app.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    return;
  }

  const mine = ME?.clan || '';
  const head = `
    <div class="clan-hero">
      <div class="clan-hero-title">Clan</div>
      <div class="clan-hero-sub">Kumpulkan EXP bersama — semakin tinggi level anggota, semakin kuat clan-mu.</div>
      <div class="clan-mine">${
        mine
          ? `Clan kamu: <b>${esc(mine)}</b> <button class="btn ghost tiny" id="leave-clan">Keluar</button>`
          : ME?.sub
          ? 'Kamu belum punya clan.'
          : 'Masuk dengan Google untuk membuat atau gabung clan.'
      }</div>
    </div>`;

  const detailHTML = detail?.clan
    ? `<div class="section"><div class="section-head"><h2>${esc(detail.clan.name)} <span class="ep-range">${esc(
        detail.clan.tag
      )}</span></h2></div>
      <div class="prof-list">
        ${(detail.members || [])
          .map((m, i) => {
            const av = avatarOf(m.name);
            const L = levelOf(m.exp || 0);
            return `<div class="prof-row">
              <span class="rank-no">${i + 1}</span>
              <span class="rank-av av-f${frameOf(L.level)}" style="background:${av.color}22;color:${av.color}">${
              m.picture ? `<img src="${esc(m.picture)}" alt="" />` : esc(av.initial)
            }</span>
              <span class="prof-row-main">
                <span class="prof-row-title">${esc(m.name)}</span>
                <span class="prof-row-meta"><span class="rank-title">${esc(
                  m.title || titleOf(L.level)
                )}</span> · Lvl. ${L.level} · ${L.exp} EXP</span>
              </span>
            </div>`;
          })
          .join('')}
      </div>
      ${
        ME?.sub && mine !== detail.clan.tag
          ? `<div style="padding:0 16px 20px"><button class="btn" id="join-this">Gabung ${esc(detail.clan.tag)}</button></div>`
          : ''
      }
      <div style="padding:0 16px 16px"><button class="btn ghost" data-nav="clan">‹ Kembali ke daftar clan</button></div>
    </div>`
    : '';

  const createForm =
    ME?.sub && !mine
      ? `<div class="section"><div class="section-head"><h2>Buat Clan</h2></div>
         <div class="c-form">
           <input id="clan-name" class="c-input" placeholder="Nama clan (min 3 huruf)" maxlength="28" />
           <input id="clan-tag" class="c-input" placeholder="Tag: 3-6 huruf/angka, mis. NIME" maxlength="6" />
           <div class="c-row"><span class="c-note">Tag dipakai temanmu untuk gabung ke clan ini.</span>
           <button class="btn" id="clan-create">Buat</button></div>
         </div></div>`
      : '';

  const listHTML = `<div class="section"><div class="section-head"><h2>Daftar Clan</h2></div>
    <div class="prof-list">${
      clans.length
        ? clans
            .map(
              (c) => `<div class="prof-row" data-clan="${esc(c.tag)}">
                <span class="clan-badge">${esc(c.tag)}</span>
                <span class="prof-row-main">
                  <span class="prof-row-title">${esc(c.name)}</span>
                  <span class="prof-row-meta">${c.members || 0}/30 anggota</span>
                </span>
                ${ME?.sub && mine !== c.tag ? '<button class="btn tiny" data-join="' + esc(c.tag) + '">Gabung</button>' : ''}
              </div>`
            )
            .join('')
        : '<div class="empty">Belum ada clan. Jadilah yang pertama membuatnya!</div>'
    }</div></div>`;

  app.innerHTML = head + (detailHTML || createForm + listHTML);

  document.getElementById('clan-create')?.addEventListener('click', async () => {
    const name = (document.getElementById('clan-name')?.value || '').trim();
    const tagv = (document.getElementById('clan-tag')?.value || '').trim().toUpperCase();
    if (name.length < 3 || tagv.length < 3) return toast('Nama dan tag minimal 3 karakter');
    try {
      const r = await fetch('/api/clan', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, tag: tagv }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      await loadMe();
      toast('Clan dibuat! +30 EXP');
      viewClan(j.clan?.tag || tagv);
    } catch (err) {
      toast(err.message);
    }
  });

  document.querySelectorAll('[data-join]').forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const r = await fetch('/api/clan/join', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ tag: b.dataset.join }),
        });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error);
        await loadMe();
        toast('Gabung clan ' + b.dataset.join);
        viewClan(b.dataset.join);
      } catch (err) {
        toast(err.message);
      }
    })
  );
  document.getElementById('join-this')?.addEventListener('click', async () => {
    try {
      const r = await fetch('/api/clan/join', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ tag: detail.clan.tag }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      await loadMe();
      toast('Gabung clan ' + detail.clan.tag);
      viewClan(detail.clan.tag);
    } catch (err) {
      toast(err.message);
    }
  });
  document.getElementById('leave-clan')?.addEventListener('click', async () => {
    try {
      await fetch('/api/clan/leave', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: '{}' });
      await loadMe();
      toast('Keluar dari clan');
      viewClan();
    } catch (err) {
      toast(err.message);
    }
  });
  document.querySelectorAll('[data-clan]').forEach((row) =>
    row.addEventListener('click', () => viewClan(row.dataset.clan))
  );
}

/* --------------------------------- ROUTER -------------------------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const seg = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const params = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { seg, params };
}

function setActiveNav(view) {
  const navAktif = { profil: 'profil', profile: 'profil', riwayat: 'riwayat', sub: 'sub', schedule: 'schedule' }[view] || 'home';
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.nav === navAktif));
}

async function route() {
  const { seg, params } = parseHash();
  const view = seg[0] || 'home';
  // mode nonton: permukaan mengambang jadi padat supaya video tidak patah-patah
  document.body.classList.toggle('watch', view === 'watch');
  setActiveNav(['home', 'ongoing', 'complete', 'movies', 'schedule', 'search', 'clan'].includes(view) ? view : '');
  window.scrollTo({ top: 0 });

  switch (view) {
    case 'home':
      return viewHome();
    case 'riwayat':
      return viewRiwayat();
    case 'sub':
      return viewSubs();
    case 'search':
      return viewSearch(params.q || '');
    case 'ongoing':
      return viewCatalog('ongoing', Number(params.page) || 1);
    case 'complete':
      return viewCatalog('complete', Number(params.page) || 1);
    case 'movies':
      return viewMovies();
    case 'schedule':
      return viewSchedule(params.day);
    case 'anime':
      return viewAnime(seg[1] || '');
    case 'meta':
      return viewMeta(seg[1] || '');
    case 'genre':
      return viewGenre(seg[1] || '', seg[2] || params.name || '');
    case 'profil':
    case 'profile':
      return viewProfile(params.tab || 'komentar');
    case 'clan':
      return viewClan(params.tag || '');
    case 'chat':
      return viewChat();
    case 'watch':
      return viewWatch(params);
    default:
      return viewHome();
  }
}

/* -------------------------------- events --------------------------------- */
// cari padanan judul di sumber streaming → slug halaman yang punya daftar
// episode lengkap 1 sampai tamat (tanpa tombol "cari episode" lagi).
const _slugCache = new Map();
async function slugStream(judul) {
  const q = String(judul || '').trim();
  if (!q) return '';
  if (_slugCache.has(q.toLowerCase())) return _slugCache.get(q.toLowerCase());
  try {
    const res = await api(`/api/search?q=${encodeURIComponent(q)}`, { ttl: 3 * 60 * 1000 });
    const kandidat = res.stream || [];
    const skor = (t) => {
      const a = q.toLowerCase().replace(/[^a-z0-9]/g, '');
      const b = String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!a || !b) return 0;
      return b === a ? 100 : b.startsWith(a) || a.startsWith(b) ? 80 : b.includes(a) || a.includes(b) ? 50 : 0;
    };
    const hit = kandidat.slice().sort((x, y) => skor(y.title) - skor(x.title))[0];
    const slug = hit?.slug || '';
    if (slug) _slugCache.set(q.toLowerCase(), slug);
    return slug;
  } catch {
    return '';
  }
}

async function handleHero(e, heroBtn) {
  if (!heroBtn) return;
  e.preventDefault();
  if (heroBtn.dataset.hero === 'info') {
    location.hash = `#/meta/${heroBtn.dataset.id}`;
  } else {
    // langsung ke daftar episode 1 -> tamat, tinggal pilih mau putar yang mana
    const q = heroBtn.dataset.title || '';
    const btn = heroBtn;
    const old = btn.textContent;
    btn.textContent = 'Menyiapkan…';
    try {
      const slug = await slugStream(q);
      if (slug) location.hash = `#/anime/${slug}`;
      else location.hash = `#/search?q=${encodeURIComponent(q)}`;
    } catch (err) {
      btn.textContent = old;
      toast(err.message);
    }
  }
}

document.addEventListener('click', (e) => {
  const heroBtn = e.target.closest('[data-hero]');
  if (heroBtn) {
    handleHero(e, heroBtn);
    return;
  }
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    const d = nav.dataset.nav;
    location.hash = d === 'home' ? '#/home' : `#/${d}`;
    return;
  }
  const go = e.target.closest('[data-go]');
  if (!go) return;
  const kind = go.dataset.go;
  if (kind === 'anime') location.hash = `#/anime/${go.dataset.slug}`;
  else if (kind === 'watch')
    location.hash = `#/watch?e=${encodeURIComponent(go.dataset.e)}&num=${encodeURIComponent(
      go.dataset.num || ''
    )}&title=${encodeURIComponent(go.dataset.title || '')}&poster=${encodeURIComponent(go.dataset.poster || '')}`;
  else if (kind === 'meta') location.hash = `#/meta/${go.dataset.id}`;
  else if (kind === 'genre') location.hash = `#/genre/${go.dataset.id}/${encodeURIComponent(go.dataset.name)}`;
});

document.getElementById('brand').addEventListener('click', () => (location.hash = '#/home'));
document.getElementById('me-btn')?.addEventListener('click', () => (location.hash = '#/profil'));

// perbarui inisial di tombol profil kalau nama berubah
paintHeader();
window.addEventListener('hashchange', route);

/* ------------------------------- inisialisasi ---------------------------- */
(async function init() {
  await loadMe();
  try {
    await api('/api/status', { ttl: 60 * 1000 });
    badge.textContent = 'real-time';
    badge.classList.add('live');
    badge.title = 'Data diambil langsung saat dibuka';
  } catch {
    badge.textContent = 'offline';
  }
  if (!location.hash) location.hash = '#/home';
  route();
})();
