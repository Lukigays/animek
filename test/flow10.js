// cek terakhir: beranda & profil tanpa data uji
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 850 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 100)); });
  await p.goto('http://127.0.0.1:3000/#/home', { waitUntil: 'domcontentloaded' });
  await wait(16000);
  console.log('BERANDA:', JSON.stringify(await p.evaluate(() => ({
    header: document.getElementById('me-btn')?.title,
    judul: [...document.querySelectorAll('.section-head h2')].map((h) => h.textContent.trim()),
    peringkat: [...document.querySelectorAll('.rank-row')].length,
    lebar: document.documentElement.scrollWidth,
  }))));
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'domcontentloaded' });
  await wait(13000);
  console.log('SETELAH RESET:', JSON.stringify(await p.evaluate(() => ({
    header: document.getElementById('me-btn')?.title,
    peringkat: [...document.querySelectorAll('.rank-row')].length,
    lebar: document.documentElement.scrollWidth,
  }))));
  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join(' | ') : 'tidak ada');
  await b.close();
})();
