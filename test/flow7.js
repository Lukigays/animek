// Uji UI: header level/EXP, papan peringkat, clan (login), profil akun
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3123';

(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 850 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 110)); });

  // 1. TAMU
  await p.goto(B + '/#/home', { waitUntil: 'domcontentloaded' });
  await wait(16000);
  console.log('HEADER TAMU:', JSON.stringify(await p.evaluate(() => ({
    name: document.getElementById('me-name')?.textContent,
    lvl: document.getElementById('me-lvl')?.textContent,
    fill: document.getElementById('me-fill')?.style.width,
    title: document.getElementById('me-btn')?.title,
  }))));
  console.log('PERINGKAT:', JSON.stringify(await p.evaluate(() => ({
    judul: [...document.querySelectorAll('.section-head h2')].map((h) => h.textContent.trim()),
    rows: [...document.querySelectorAll('.rank-row')].map((r) => ({
      no: r.querySelector('.rank-no')?.textContent,
      nama: r.querySelector('.rank-main b')?.textContent,
      meta: r.querySelector('.rank-main small')?.textContent,
    })),
  })), null, 1));

  // 2. LOGIN (suntik token sesi, seolah-olah sudah lewat Google)
  await p.evaluate(() => localStorage.setItem('kelasnime:token', 'token-uji-123'));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await wait(12000);
  console.log('TOKEN DI BROWSER:', await p.evaluate(async () => {
    const t = localStorage.getItem('kelasnime:token');
    const j = await (await fetch('/api/me', { headers: { Authorization: 'Bearer ' + t } })).json();
    return t + ' | ' + JSON.stringify(j).slice(0, 140);
  }));
  console.log('HEADER LOGIN:', JSON.stringify(await p.evaluate(() => ({
    name: document.getElementById('me-name')?.textContent,
    lvl: document.getElementById('me-lvl')?.textContent,
    fill: document.getElementById('me-fill')?.style.width,
    title: document.getElementById('me-btn')?.title,
  }))));

  // 3. HALAMAN CLAN
  await p.evaluate(() => (location.hash = '#/clan'));
  await wait(4000);
  console.log('CLAN:', JSON.stringify(await p.evaluate(() => ({
    hero: document.querySelector('.clan-hero-sub')?.textContent.slice(0, 48),
    mine: document.querySelector('.clan-mine')?.textContent.trim().slice(0, 40),
    rows: [...document.querySelectorAll('[data-clan]')].map((r) => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)),
  })), null, 1));

  // detail clan lewat klik
  await p.evaluate(() => document.querySelector('[data-clan]')?.click());
  await wait(3500);
  console.log('DETAIL CLAN:', JSON.stringify(await p.evaluate(() => ({
    head: document.querySelector('.section-head h2')?.textContent.replace(/\s+/g, ' ').trim(),
    members: [...document.querySelectorAll('.prof-row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 38)),
  }))));

  // 4. PROFIL
  await p.evaluate(() => (location.hash = '#/profil'));
  await wait(3500);
  console.log('PROFIL:', JSON.stringify(await p.evaluate(() => ({
    name: document.querySelector('.prof-name-static')?.textContent,
    sub: document.querySelector('.prof-sub')?.textContent,
    lvl: document.querySelector('.lvl-top')?.textContent.replace(/\s+/g, ' ').trim(),
    bar: document.querySelector('.lvl-bar i')?.style.width,
    clan: document.querySelector('.clan-mini')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 30),
    stats: [...document.querySelectorAll('.prof-stats b')].map((x) => x.textContent),
    logout: !!document.getElementById('logout'),
    gbtn: !!document.getElementById('gbtn'),
    docWidth: document.documentElement.scrollWidth,
  })), null, 1));

  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join('\n') : 'tidak ada');
  await b.close();
})();
