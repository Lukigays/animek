// Uji alur baru: home -> detail (daftar episode 1..tamat) -> nonton (iframe /api/embed)
// + cek tidak ada jejak sumber di DOM & network
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BAD = /samehadaku|oploverz|otakudesu|kuramanime/i;

(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 850 });
  const errs = [];
  const leaks = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 120)); });
  p.on('request', (r) => { if (BAD.test(r.url())) leaks.push('REQ ' + r.url().slice(0, 100)); });
  p.on('response', (r) => { if (BAD.test(r.url())) leaks.push('RES ' + r.url().slice(0, 100)); });

  await p.goto('http://127.0.0.1:3000/#/home', { waitUntil: 'domcontentloaded' });
  await wait(10000);

  // buka detail anime dari kartu terbaru
  await p.evaluate(() => { const c = document.querySelector('.card[data-go="anime"]'); if (c) c.click(); });
  await wait(20000);
  const detail = await p.evaluate(() => ({
    hash: location.hash,
    title: document.querySelector('.detail-head h1')?.textContent,
    range: document.querySelector('.ep-range')?.textContent,
    eps: document.querySelectorAll('.ep-item').length,
    firstEp: document.querySelector('.ep-item .ep-num')?.textContent,
    lastEp: [...document.querySelectorAll('.ep-item .ep-num')].pop()?.textContent,
    pills: [...document.querySelectorAll('.detail-head .pill')].map((x) => x.textContent.trim()),
    hasTrailer: !!document.querySelector('.trailer'),
    domLeak: /samehadaku|oploverz/i.test(document.body.innerHTML),
  }));
  console.log('DETAIL:', JSON.stringify(detail, null, 1));
  console.log('APP TEXT (200 char):', (await p.evaluate(() => document.getElementById('app').textContent.replace(/\s+/g,' ').slice(0,200))));

  // klik episode terakhir (harusnya nomor terbesar)
  await p.evaluate(() => { const items = [...document.querySelectorAll('.ep-item')]; if (items.length) items[items.length - 1].click(); });
  await wait(20000);
  const watch = await p.evaluate(() => ({
    hash: location.hash.slice(0, 70),
    iframe: document.querySelector('#frame iframe')?.getAttribute('src'),
    chips: [...document.querySelectorAll('.server-chip')].map((c) => c.textContent.trim()),
    title: document.querySelector('.watch-head h1')?.textContent,
    sub: document.querySelector('.watch-head .sub')?.textContent,
    domLeak: /samehadaku|oploverz/i.test(document.body.innerHTML),
  }));
  console.log('WATCH:', JSON.stringify(watch, null, 1));

  // ganti server
  await p.evaluate(() => { const c = [...document.querySelectorAll('.server-chip')]; if (c.length > 1) c[1].click(); });
  await wait(6000);
  const after = await p.evaluate(() => ({
    iframe: document.querySelector('#frame iframe')?.getAttribute('src'),
    active: document.querySelector('.server-chip.active')?.textContent.trim(),
  }));
  console.log('GANTI SERVER:', JSON.stringify(after));

  console.log('\nBOCORAN SUMBER (request/response/DOM):', leaks.length ? [...new Set(leaks)].join('\n') : 'TIDAK ADA');
  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join('\n') : 'tidak ada');
  await b.close();
})();
