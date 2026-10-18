// Uji: scraper unduhan (Kusonime), tombol unduh, filter manga/novel, tema kaca
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3000';
(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  await p.setViewport({ width: 390, height: 920, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 90)); });

  // 1) tombol unduh di halaman nonton
  await p.goto(B + '/#/watch?slug=sousou-no-frieren&num=1&title=Sousou%20no%20Frieren', { waitUntil: 'domcontentloaded' });
  await wait(20000);
  console.log('1) HALAMAN NONTON:', JSON.stringify(await p.evaluate(() => ({
    tombolUnduh: !!document.getElementById('a-dl'),
    judul: document.querySelector('.watch-head h1')?.textContent,
  }))));
  await p.evaluate(() => document.getElementById('a-dl')?.click());
  await wait(12000);
  console.log('2) PANEL UNDUHAN:', JSON.stringify(await p.evaluate(() => ({
    panel: !!document.querySelector('.sheet'),
    judul: document.querySelector('.sheet-head h3')?.textContent,
    grup: [...document.querySelectorAll('.dl-q')].slice(0, 4).map((x) => x.textContent.trim()),
    jumlahLink: document.querySelectorAll('.dl-link').length,
    linkLangsung: document.querySelectorAll('.dl-link.direct').length,
    contohLangsung: document.querySelector('.dl-link.direct')?.getAttribute('href')?.slice(0, 26),
    kaca: (() => { const s = getComputedStyle(document.querySelector('.sheet') || document.body); return s.backdropFilter || 'none'; })(),
  }), null, 1)));
  await p.screenshot({ path: '/home/user/kelasnime/test/glass-unduh.png' });

  // 3) unduhan langsung benar-benar jalan?
  const dl = await p.evaluate(async () => {
    const a = document.querySelector('.dl-link.direct');
    if (!a) return 'tidak ada link langsung';
    const r = await fetch(a.getAttribute('href'), { headers: { Range: 'bytes=0-500' } });
    const cd = r.headers.get('content-disposition') || '';
    const buf = await r.arrayBuffer();
    return `status ${r.status} | ${buf.byteLength} bita | ${cd.slice(0, 60)}`;
  });
  console.log('3) UJI UNDUH LANGSUNG:', dl);

  // 4) tidak ada manga/novel di hasil cari
  await p.goto(B + '/#/search', { waitUntil: 'domcontentloaded' });
  await wait(6000);
  for (const q of ['one piece', 'berserk', 'naruto']) {
    await p.evaluate((qq) => { const i = document.getElementById('search-input'); if (i) { i.value = qq; i.dispatchEvent(new Event('input', { bubbles: true })); i.form?.dispatchEvent(new Event('submit', { bubbles: true })); } }, q);
    await wait(9000);
    const r = await p.evaluate(() => ({
      judul: [...document.querySelectorAll('.section-head h2')].map((h) => h.textContent.trim()),
      adaManga: /manga|manhwa|novel|doujin/i.test(document.body.innerText),
    }));
    console.log(`4) CARI "${q}":`, JSON.stringify(r));
  }
  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join(' | ') : 'tidak ada');
  await b.close();
})();
