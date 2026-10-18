// Uji: like + riwayat nonton -> muncul di tab Profil, dan klik baris berpindah halaman
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 850 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));

  // tonton 1 episode + like
  await p.goto('http://127.0.0.1:3000/#/anime/sousou-no-frieren-season-2', { waitUntil: 'domcontentloaded' });
  await wait(18000);
  await p.evaluate(() => document.querySelector('.ep-item')?.click());
  await wait(16000);
  await p.evaluate(() => document.getElementById('a-like')?.click());
  await wait(1500);
  console.log('LIKE:', JSON.stringify(await p.evaluate(() => ({
    on: document.getElementById('a-like')?.classList.contains('on'),
    n: document.getElementById('like-n')?.textContent,
  }))));

  // buka profil
  await p.evaluate(() => (location.hash = '#/profil'));
  await wait(2500);
  console.log('TAB KOMENTAR:', JSON.stringify(await p.evaluate(() => ({
    stats: [...document.querySelectorAll('.prof-stats b')].map((x) => x.textContent),
    rows: document.querySelectorAll('.prof-row').length,
  }))));

  await p.evaluate(() => document.querySelector('.tab[data-tab="suka"]')?.click());
  await wait(1500);
  console.log('TAB DISUKAI:', JSON.stringify(await p.evaluate(() => ({
    rows: [...document.querySelectorAll('.prof-row')].map((r) => r.querySelector('.prof-row-title')?.textContent.slice(0, 30)),
  }))));

  await p.evaluate(() => document.querySelector('.tab[data-tab="riwayat"]')?.click());
  await wait(1500);
  console.log('TAB RIWAYAT:', JSON.stringify(await p.evaluate(() => ({
    rows: [...document.querySelectorAll('.prof-row')].map((r) => ({
      t: r.querySelector('.prof-row-title')?.textContent.slice(0, 28),
      m: r.querySelector('.prof-row-meta')?.textContent.trim(),
    })),
  }))));

  // klik baris riwayat -> harus ke halaman anime
  await p.evaluate(() => document.querySelector('.prof-row')?.click());
  await wait(6000);
  console.log('KLIK BARIS ->', JSON.stringify(await p.evaluate(() => ({
    hash: location.hash.slice(0, 50),
    title: document.querySelector('.detail-head h1')?.textContent.slice(0, 30),
  }))));

  console.log('ERROR JS:', errs.length ? errs.join(' | ') : 'tidak ada');
  await b.close();
})();
