// Uji fitur baru: Anime Terkait, Komentar, aksi pemutar (play/skip10/share/like)
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 850 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 100)); });

  // ---- DETAIL: Anime Terkait + Komentar ----
  await p.goto('http://127.0.0.1:3000/#/anime/sousou-no-frieren-season-2', { waitUntil: 'domcontentloaded' });
  await wait(20000);
  const det = await p.evaluate(() => ({
    sections: [...document.querySelectorAll('.section-head h2')].map((h) => h.textContent.trim().replace(/\s+/g, ' ')),
    related: [...document.querySelectorAll('.hscroll .card')].slice(-4).map((c) => ({
      t: c.querySelector('.title')?.textContent.slice(0, 32),
      badge: c.querySelector('.badge.rel')?.textContent || c.querySelector('.badge.eps')?.textContent || '',
    })),
    commentForm: !!document.getElementById('c-text'),
    note: document.querySelector('.c-note')?.textContent.slice(0, 60),
    commentCount: document.querySelectorAll('.comment').length,
  }));
  console.log('DETAIL:', JSON.stringify(det, null, 1));

  // kirim komentar lewat UI
  await p.evaluate(() => {
    document.getElementById('c-name').value = 'Uji Coba';
    document.getElementById('c-text').value = 'Komentar dari tes otomatis';
    document.getElementById('c-send').click();
  });
  await wait(3000);
  const afterPost = await p.evaluate(() => ({
    count: document.querySelectorAll('.comment').length,
    first: document.querySelector('.comment .c-text')?.textContent,
    name: document.querySelector('.comment .c-head b')?.textContent,
    time: document.querySelector('.comment .c-time')?.textContent,
  }));
  console.log('SETELAH KIRIM KOMENTAR:', JSON.stringify(afterPost));

  // like komentar
  await p.evaluate(() => document.querySelector('.comment .c-like')?.click());
  await wait(1500);
  console.log('LIKE KOMENTAR:', JSON.stringify(await p.evaluate(() => ({
    on: !!document.querySelector('.comment .c-like.on'),
    n: document.querySelector('.comment .c-like span')?.textContent,
  }))));

  // ---- WATCH: aksi pemutar ----
  await p.goto('http://127.0.0.1:3000/#/anime/sousou-no-frieren-season-2', { waitUntil: 'domcontentloaded' });
  await wait(14000);
  await p.evaluate(() => document.querySelector('.ep-item')?.click());
  await wait(16000);
  const watch = await p.evaluate(() => ({
    actions: [...document.querySelectorAll('.act')].map((a) => a.textContent.trim()),
    chips: [...document.querySelectorAll('.server-chip')].map((c) => c.textContent.trim() + '[' + c.dataset.type + ']'),
    toggleDisabled: document.getElementById('a-toggle')?.classList.contains('disabled'),
    views: document.getElementById('view-n')?.textContent,
    likeN: document.getElementById('like-n')?.textContent,
  }));
  console.log('WATCH:', JSON.stringify(watch, null, 1));

  // klik like judul
  await p.evaluate(() => document.getElementById('a-like')?.click());
  await wait(1500);
  console.log('LIKE JUDUL:', JSON.stringify(await p.evaluate(() => ({
    on: document.getElementById('a-like')?.classList.contains('on'),
    n: document.getElementById('like-n')?.textContent,
  }))));

  // pindah ke server mp4/hls kalau ada → kontrol harus aktif
  const mp4 = await p.evaluate(() => {
    const c = [...document.querySelectorAll('.server-chip')].find((x) => x.dataset.type === 'mp4' || x.dataset.type === 'hls');
    if (c) c.click();
    return c ? c.textContent.trim() : null;
  });
  await wait(9000);
  const ctrl = await p.evaluate(() => {
    const fr = document.getElementById('ply');
    let inner = null;
    try {
      const d = fr?.contentDocument;
      inner = {
        hasVideo: !!d?.getElementById('v'),
        buttons: [...(d?.querySelectorAll('#bar button') || [])].map((x) => x.id),
        speed: !!d?.getElementById('rate'),
        seek: !!d?.getElementById('seek'),
        time: d?.getElementById('tt')?.textContent,
      };
    } catch (e) {
      inner = { err: e.message };
    }
    return { disabled: document.getElementById('a-toggle')?.classList.contains('disabled'), inner };
  });
  console.log('SERVER MP4/HLS:', mp4, '| KONTROL:', JSON.stringify(ctrl));

  // tes kirim perintah skip 10 detik dari tombol luar
  await p.evaluate(() => document.getElementById('a-fwd')?.click());
  await wait(1200);
  console.log('SETELAH KLIK +10s:', JSON.stringify(await p.evaluate(() => {
    try { return { t: document.getElementById('ply').contentDocument.getElementById('tt').textContent }; }
    catch (e) { return { err: e.message }; }
  })));

  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join('\n') : 'tidak ada');
  await b.close();
})();
