// Uji ronde ini: nav baru, rekomendasi+terbaru di beranda, subscribe, riwayat,
// cadangan sumber, kartu tetap ke detail, UI bersih.
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
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 70)); });

  // 1) BERANDA: nav baru + rekomendasi + terbaru
  await p.goto(B + '/#/home', { waitUntil: 'domcontentloaded' });
  await wait(18000);
  const home = await p.evaluate(() => ({
    nav: [...document.querySelectorAll('.bottom-nav .nav-item')].map((x) => x.textContent.trim()),
    bagian: [...document.querySelectorAll('.section-head h2')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
    kartuTerbaru: document.querySelectorAll('#home-terbaru .card').length,
    kartuRekom: document.querySelectorAll('#home-rekom .card').length,
    adaUnduh: !!document.getElementById('btn-dl') || !!document.getElementById('a-dl'),
  }));
  console.log('1) BERANDA:', JSON.stringify(home, null, 1));
  await p.screenshot({ path: '/home/user/kelasnime/test/home-baru.png' });

  // 2) DETAIL: tombol subscribe + klik → tersimpan
  await p.goto(B + '/#/anime/mao', { waitUntil: 'domcontentloaded' });
  await wait(20000);
  const sebelum = await p.evaluate(() => document.getElementById('btn-sub')?.textContent?.trim());
  await p.evaluate(() => document.getElementById('btn-sub')?.click());
  await wait(1200);
  const sesudah = await p.evaluate(() => document.getElementById('btn-sub')?.textContent?.trim());
  console.log('2) SUBSCRIBE:', JSON.stringify({ sebelum, sesudah }));

  // 3) halaman Subscribe berisi MAO
  await p.goto(B + '/#/sub', { waitUntil: 'domcontentloaded' });
  await wait(3000);
  const sub = await p.evaluate(() => ({
    judul: [...document.querySelectorAll('.grid .title')].map((x) => x.textContent.trim()).slice(0, 3),
    kosong: !!document.querySelector('.empty'),
  }));
  console.log('3) HALAMAN SUBSCRIBE:', JSON.stringify(sub));

  // 4) halaman Riwayat (awal kosong) lalu nonton dulu
  await p.goto(B + '/#/watch?slug=mao&num=3&title=MAO', { waitUntil: 'domcontentloaded' });
  await wait(15000);
  await p.goto(B + '/#/riwayat', { waitUntil: 'domcontentloaded' });
  await wait(2000);
  const hist = await p.evaluate(() => ({
    judul: [...document.querySelectorAll('.grid .title')].map((x) => x.textContent.trim()).slice(0, 3),
    kosong: !!document.querySelector('.empty'),
  }));
  console.log('4) HALAMAN RIWAYAT:', JSON.stringify(hist));

  // 5) nav jadwal tayang berfungsi
  await p.goto(B + '/#/schedule', { waitUntil: 'domcontentloaded' });
  await wait(12000);
  const jadwal = await p.evaluate(() => ({
    bagian: [...document.querySelectorAll('.section-head h2, .chips .chip')].slice(0, 4).map((x) => x.textContent.trim().slice(0, 16)),
    kartu: document.querySelectorAll('.card').length,
    navAktif: document.querySelector('.bottom-nav .nav-item.active')?.textContent?.trim(),
  }));
  console.log('5) JADWAL:', JSON.stringify(jadwal));

  // 6) endpoint: latest & search (sumber baru ikut)
  const api = await p.evaluate(async () => {
    const l = await fetch('/api/latest?page=1').then((r) => r.json()).catch(() => null);
    const s = await fetch('/api/search?q=mao').then((r) => r.json()).catch(() => null);
    return {
      latestOk: !!l?.ok, jumlah: l?.data?.length || 0, stale: !!l?.stale,
      cariOk: !!s?.ok, hasilCari: (s?.stream || []).length + (s?.info || []).length,
    };
  });
  console.log('6) API:', JSON.stringify(api));

  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join(' | ') : 'tidak ada');
  await b.close();
})();
