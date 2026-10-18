// Regresi akhir: login, katalog, detail, playback, dan unduhan
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3000';
(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  await p.setViewport({ width: 390, height: 920, deviceScaleFactor: 2 });
  const errs = [], buruk = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 80)); });
  p.on('response', (r) => { if (r.status() >= 400) buruk.push(r.status() + ' ' + r.url().slice(0, 80)); });

  // login sekali → refresh
  await p.goto(B + '/#/profil', { waitUntil: 'domcontentloaded' });
  await wait(7000);
  await p.evaluate(() => { const i = document.getElementById('prof-name'); if (i) { i.value = 'Luffy'; i.dispatchEvent(new Event('change', { bubbles: true })); } });
  await p.evaluate(() => document.getElementById('demo-login')?.click());
  await wait(3000);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await wait(8000);
  console.log('1) LOGIN TAHAN REFRESH:', await p.evaluate(() => document.getElementById('me-btn')?.title + ' | tombol keluar: ' + !!document.getElementById('logout')));

  // beranda
  await p.evaluate(() => (location.hash = '#/home'));
  // beranda menunggu katalog render (tanpa widget sosial).
  for (let i = 0; i < 25; i++) {
    const ada = await p.evaluate(() => !!document.querySelector('.release-card'));
    if (ada) break;
    await wait(1000);
  }
  console.log('2) BERANDA:', JSON.stringify(await p.evaluate(() => ({
    heading: document.querySelector('.release-heading h1')?.textContent.trim(),
    cards: document.querySelectorAll('.release-card').length,
    tanpaChat: !/Global Chat|TOP NAKAMA|Rekomendasi Anime/.test(document.body.innerText),
    tabs: [...document.querySelectorAll('.catalog-tab')].map((x) => x.textContent.trim()),
  }))));

  // one piece
  await p.goto(B + '/#/anime/one-piece', { waitUntil: 'domcontentloaded' });
  await wait(24000);
  console.log('3) EPISODE ONE PIECE:', JSON.stringify(await p.evaluate(() => ({
    heading: document.querySelector('.section-head h2')?.textContent.replace(/\s+/g, ' ').trim(),
    jumlah: document.querySelectorAll('#ep-list .ep-item').length,
    pertama: document.querySelector('#ep-list .ep-item')?.dataset.ep,
    terakhir: [...document.querySelectorAll('#ep-list .ep-item')].pop()?.dataset.ep,
    grup: [...document.querySelectorAll('.ep-chip')].map((c) => c.textContent.trim()).slice(0, 3),
    tombolUnduh: !!document.getElementById('btn-dl'),
  }), null, 1)));

  // putar episode
  await p.evaluate(() => { const i = [...document.querySelectorAll('#ep-list .ep-item')].filter((e) => e.style.display !== 'none'); i[i.length - 1]?.click(); });
  await wait(22000);
  console.log('4) PUTAR:', JSON.stringify(await p.evaluate(() => ({
    sub: document.querySelector('.watch-head .sub')?.textContent.replace(/\s+/g, ' ').trim(),
    error: /tidak valid|kedaluwarsa/i.test(document.body.innerText),
    tombolUnduh: !!document.getElementById('a-dl'),
    pemutar: !!document.getElementById('ply'),
  }))));

  // bagian unduhan di halaman nonton
  console.log('5) BAGIAN UNDUHAN:', JSON.stringify(await p.evaluate(() => ({
    grup: [...document.querySelectorAll('.dl-q')].slice(0, 4).map((x) => x.textContent.trim()),
    link: document.querySelectorAll('#watch-download .dl-link').length,
    langsung: document.querySelectorAll('#watch-download .dl-link.direct').length,
  }))));
  await p.screenshot({ path: '/home/user/kelasnime/test/akhir-unduh.png' });
  await p.goto(B + '/#/home', { waitUntil: 'domcontentloaded' });
  await wait(14000);
  await p.screenshot({ path: '/home/user/kelasnime/test/akhir-home.png' });

  console.log('REQUEST GAGAL:', buruk.length ? [...new Set(buruk)].join(' | ') : 'tidak ada');
  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join(' | ') : 'tidak ada');
  await b.close();
})();
