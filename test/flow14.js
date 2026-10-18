// Uji tata letak baru: beranda ala Wibuku + navigasi 5 item
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
  await p.goto(B + '/#/home', { waitUntil: 'domcontentloaded' });
  await wait(15000);
  console.log('NAVIGASI:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.bottom-nav .nav-item')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()))));
  console.log('URUTAN BERANDA:', JSON.stringify(await p.evaluate(() => ({
    section: [...document.querySelectorAll('.section-head h2')].map((h) => h.textContent.trim()),
    adaKartuAkun: !!document.querySelector('.acc-card'),
    adaMisi: !!document.querySelector('.mission'),
    adaCari: !!document.getElementById('search-input'),
    adaChat: !!document.getElementById('gchat'),
    lebar: document.documentElement.scrollWidth,
    tinggi: document.documentElement.scrollHeight,
  }), null, 0)));
  console.log('ISI HALAMAN (teks):', JSON.stringify(await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 260))));

  // tab Terbaru
  await p.evaluate(() => document.querySelector('[data-nav="ongoing"]')?.click());
  await wait(14000);
  console.log('TAB TERBARU:', JSON.stringify(await p.evaluate(() => ({
    hash: location.hash,
    judul: [...document.querySelectorAll('.section-head h2')].map((h) => h.textContent.trim()),
    kartu: document.querySelectorAll('.card').length,
  }))));

  // tab Chat & Profil
  await p.evaluate(() => document.querySelector('[data-nav="chat"]')?.click());
  await wait(4000);
  console.log('TAB CHAT:', await p.evaluate(() => location.hash + ' | judul ' + document.querySelector('.section-head h2')?.textContent));
  await p.evaluate(() => document.querySelector('[data-nav="profil"]')?.click());
  await wait(4000);
  console.log('TAB PROFIL:', await p.evaluate(() => location.hash + ' | ' + (document.querySelector('.prof-name-static')?.textContent || document.getElementById('prof-name')?.value)));
  await p.evaluate(() => document.querySelector('[data-nav="schedule"]')?.click());
  await wait(9000);
  console.log('TAB JADWAL:', await p.evaluate(() => location.hash + ' | baris ' + document.querySelectorAll('.day-row, .sched-row, .section-head h2').length));
  await p.evaluate(() => document.querySelector('[data-nav="home"]')?.click());
  await wait(12000);
  await p.screenshot({ path: '/home/user/kelasnime/test/shot-home-final.png' });
  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join(' | ') : 'tidak ada');
  await b.close();
})();
