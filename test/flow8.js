// Uji alur login demo -> buat clan -> komentar -> peringkat (MongoDB)
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3000';

(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 850 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 110)); });

  await p.goto(B + '/#/profil', { waitUntil: 'domcontentloaded' });
  await wait(9000);
  console.log('SEBELUM LOGIN:', JSON.stringify(await p.evaluate(() => ({
    gbtn: document.getElementById('gbtn')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 90),
    demoBtn: document.getElementById('demo-login')?.textContent,
    header: document.getElementById('me-name')?.textContent,
  }))));
  await p.screenshot({ path: '/home/user/kelasnime/test/shot-login.png' });

  // isi nama lalu klik login demo
  await p.evaluate(() => { const i = document.getElementById('prof-name'); if (i) { i.value = 'Rangga'; i.dispatchEvent(new Event('change', { bubbles: true })); } });
  await p.evaluate(() => document.getElementById('demo-login')?.click());
  await wait(4000);
  console.log('SETELAH LOGIN DEMO:', JSON.stringify(await p.evaluate(() => ({
    header: document.getElementById('me-name')?.textContent + ' · ' + document.getElementById('me-lvl')?.textContent,
    title: document.getElementById('me-btn')?.title,
    profName: document.querySelector('.prof-name-static')?.textContent,
    profSub: document.querySelector('.prof-sub')?.textContent,
    logout: !!document.getElementById('logout'),
    token: (localStorage.getItem('kelasnime:token') || '').slice(0, 8) + '…',
  })), null, 1));
  await p.screenshot({ path: '/home/user/kelasnime/test/shot-profil-login.png' });

  // buat clan lewat UI
  await p.evaluate(() => (location.hash = '#/clan'));
  await wait(3500);
  const created = await p.evaluate(async () => {
    const r = await fetch('/api/clan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('kelasnime:token') },
      body: JSON.stringify({ name: 'Kelas Nime', tag: 'KNME' }),
    });
    return r.json();
  });
  console.log('BUAT CLAN:', JSON.stringify(created).slice(0, 120));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await wait(3500);
  console.log('CLAN SAYA:', JSON.stringify(await p.evaluate(() => ({
    mine: document.querySelector('.clan-mine')?.textContent.replace(/\s+/g, ' ').trim(),
    rows: [...document.querySelectorAll('[data-clan]')].map((r) => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 34)),
    header: document.getElementById('me-name')?.textContent + ' · ' + document.getElementById('me-btn')?.title,
  })), null, 1));
  await p.screenshot({ path: '/home/user/kelasnime/test/shot-clan.png' });

  // home: peringkat
  await p.evaluate(() => (location.hash = '#/home'));
  await wait(11000);
  await p.screenshot({ path: '/home/user/kelasnime/test/shot-home.png' });
  console.log('PERINGKAT HOME:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.rank-row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)))));

  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join('\n') : 'tidak ada');
  await b.close();
})();
