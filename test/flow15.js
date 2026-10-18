const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3000';
(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 900 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 90)); });

  // 1) login demo, lalu refresh — harus tetap login
  await p.goto(B + '/#/profil', { waitUntil: 'domcontentloaded' });
  await wait(8000);
  await p.evaluate(() => { const i = document.getElementById('prof-name'); if (i) { i.value = 'Luffy'; i.dispatchEvent(new Event('change', { bubbles: true })); } });
  await p.evaluate(() => document.getElementById('demo-login')?.click());
  await wait(3500);
  const sebelum = await p.evaluate(() => document.getElementById('me-btn')?.title);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await wait(9000);
  const sesudah = await p.evaluate(() => ({
    judul: document.getElementById('me-btn')?.title,
    nama: document.querySelector('.prof-name-static')?.textContent,
    logout: !!document.getElementById('logout'),
  }));
  console.log('SEBELUM REFRESH:', sebelum);
  console.log('SETELAH REFRESH:', JSON.stringify(sesudah));

  // 2) beranda: kartu misi harus hilang
  await p.evaluate(() => (location.hash = '#/home'));
  await wait(14000);
  console.log('BERANDA:', JSON.stringify(await p.evaluate(() => ({
    adaMisi: !!document.querySelector('.mission'),
    adaKartuAkun: !!document.querySelector('.acc-card'),
    section: [...document.querySelectorAll('.section-head h2')].map((h) => h.textContent.trim()),
  }))));

  // 3) detail One Piece: daftar episode lengkap + grup
  await p.goto(B + '/#/anime/one-piece', { waitUntil: 'domcontentloaded' });
  await wait(20000);
  console.log('ONE PIECE:', JSON.stringify(await p.evaluate(() => ({
    judul: document.querySelector('.detail-head h1')?.textContent,
    heading: [...document.querySelectorAll('.section-head h2')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
    jumlahItem: document.querySelectorAll('#ep-list .ep-item').length,
    nomorPertama: document.querySelector('#ep-list .ep-item')?.dataset.ep,
    nomorTerakhir: [...document.querySelectorAll('#ep-list .ep-item')].pop()?.dataset.ep,
    grup: [...document.querySelectorAll('.ep-chip')].map((c) => c.textContent.trim()),
    tampil: [...document.querySelectorAll('#ep-list .ep-item')].filter((e) => e.style.display !== 'none').length,
  }), null, 1)));

  // 4) komentar per episode
  const komentar = await p.evaluate(async () => {
    const k1 = 'ep:one-piece:1';
    const k2 = 'ep:one-piece:1180';
    const kirim = (key, text) => fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('kelasnime:token') },
      body: JSON.stringify({ key, text, name: 'Luffy' }),
    }).then((r) => r.json());
    await kirim(k1, 'Komentar khusus episode 1');
    await kirim(k2, 'Komentar khusus episode 1180');
    const g = (k) => fetch('/api/comments?key=' + encodeURIComponent(k)).then((r) => r.json());
    const a = await g(k1);
    const c = await g(k2);
    return {
      ep1: (a.items || []).map((x) => x.text),
      ep1180: (c.items || []).map((x) => x.text),
      picker: !!document.getElementById('ep-pick'),
    };
  });
  console.log('KOMENTAR PER EPISODE:', JSON.stringify(komentar, null, 1));

  // 5) halaman nonton: komentar khusus episode
  await p.goto(B + '/#/watch?slug=one-piece&num=1180&title=One%20Piece', { waitUntil: 'domcontentloaded' });
  await wait(22000);
  console.log('HALAMAN NONTON:', JSON.stringify(await p.evaluate(() => ({
    judul: document.querySelector('.watch-head h1')?.textContent,
    sub: document.querySelector('.watch-head .sub')?.textContent.replace(/\s+/g, ' ').trim(),
    komentar: [...document.querySelectorAll('#watch-comments .c-text')].map((t) => t.textContent.slice(0, 40)),
    formKomentar: !!document.getElementById('c-send'),
    server: document.querySelectorAll('#servers .srv, #servers button').length,
  }), null, 1)));
  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join(' | ') : 'tidak ada');
  await b.close();
})();
