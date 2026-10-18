// Uji tampilan baru: gelar, bingkai, check-in, lencana level komentar, medali
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3000';
(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 900 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 100)); });

  // login demo
  await p.goto(B + '/#/profil', { waitUntil: 'domcontentloaded' });
  await wait(8000);
  await p.evaluate(() => { const i = document.getElementById('prof-name'); if (i) { i.value = 'Sakura'; i.dispatchEvent(new Event('change', { bubbles: true })); } });
  await p.evaluate(() => document.getElementById('demo-login')?.click());
  await wait(3500);

  console.log('HEADER:', JSON.stringify(await p.evaluate(() => ({
    nama: document.getElementById('me-name')?.textContent,
    gelar: document.getElementById('me-title')?.textContent,
    lvl: document.getElementById('me-lvl')?.textContent,
    bingkai: document.getElementById('me-av')?.className,
    lebar: document.documentElement.scrollWidth,
  }))));

  console.log('PROFIL:', JSON.stringify(await p.evaluate(() => ({
    nama: document.querySelector('.prof-name-static')?.textContent,
    gelar: document.querySelector('.lvl-gelar')?.textContent,
    bingkaiAvatar: document.querySelector('.prof-av')?.className,
    checkin: document.querySelector('.checkin-top b')?.textContent,
    tombol: document.getElementById('checkin')?.textContent.trim(),
    dotMenyala: document.querySelectorAll('.ci-dot.on').length,
  })), null, 1));

  // klik check-in
  const before = await p.evaluate(() => document.getElementById('me-btn')?.title);
  await p.evaluate(() => document.getElementById('checkin')?.click());
  await wait(3000);
  console.log('SETELAH CHECK-IN:', JSON.stringify(await p.evaluate(() => ({
    tombol: document.getElementById('checkin')?.textContent.trim(),
    disabled: document.getElementById('checkin')?.disabled,
    dot: document.querySelectorAll('.ci-dot.on').length,
    expFloat: document.querySelector('.exp-float')?.textContent || '(sudah hilang)',
  }))));
  console.log('  header sebelum:', before, '\n  header sesudah:', await p.evaluate(() => document.getElementById('me-btn')?.title));

  // beranda: papan peringkat
  await p.evaluate(() => (location.hash = '#/home'));
  await wait(13000);
  console.log('PERINGKAT:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.rank-row')].map((r) => ({
    medal: r.querySelector('.rank-no')?.textContent,
    nama: r.querySelector('.rank-main b')?.textContent,
    gelar: r.querySelector('.rank-title')?.textContent,
    meta: r.querySelector('.rank-main small')?.textContent,
    bingkai: r.querySelector('.rank-av')?.className.replace('rank-av ', ''),
  }))), null, 1));

  // komentar: lencana level
  await p.evaluate(async () => {
    await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('kelasnime:token') },
      body: JSON.stringify({ key: 'anime:uji-tampilan', text: 'Komentar dengan lencana level' }),
    });
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await wait(2000);
  await p.goto(B + '/#/anime/frieren', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await wait(1000);
  const komentar = await p.evaluate(async () => {
    const j = await (await fetch('/api/comments?key=anime:uji-tampilan')).json();
    return j.items.map((c) => ({ nama: c.name, lvl: c.ulevel, gelar: c.utitle }));
  });
  console.log('DATA KOMENTAR UNTUI LENCANA:', JSON.stringify(komentar));

  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join(' | ') : 'tidak ada');
  await b.close();
})();
