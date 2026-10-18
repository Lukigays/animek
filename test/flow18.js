// Uji akhir: scraper baru + klaim/level + naik level + komentar (login & per episode)
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

  await p.goto(B + '/#/profil', { waitUntil: 'domcontentloaded' });
  await wait(8000);
  await p.evaluate(() => { const i = document.getElementById('prof-name'); if (i) { i.value = 'Zoro'; i.dispatchEvent(new Event('change', { bubbles: true })); } });
  await p.evaluate(() => document.getElementById('demo-login')?.click());
  await wait(3500);

  // klaim → naik level (EXP 0 → 25 → 50 = Lvl 2)
  await p.evaluate(() => (location.hash = '#/home'));
  await wait(13000);
  const a0 = await p.evaluate(() => document.getElementById('me-btn')?.title);
  await p.evaluate(() => document.getElementById('home-checkin')?.click());
  await wait(4500);
  const a1 = await p.evaluate(() => ({
    header: document.getElementById('me-btn')?.title,
    tombol: document.getElementById('home-checkin')?.textContent?.trim(),
    nonaktif: document.getElementById('home-checkin')?.disabled,
  }));
  // tambah EXP sampai naik level (lewat API, seperti menonton)
  await p.evaluate(async () => {
    for (let i = 0; i < 2; i++) {
      await fetch('/api/me/exp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('kelasnime:token') }, body: JSON.stringify({ amount: 100, reason: 'watch' }) });
    }
  });
  await p.evaluate(() => (location.hash = '#/profil'));
  await wait(9000);
  await p.evaluate(() => (location.hash = '#/home'));
  await wait(12000);
  const a2 = await p.evaluate(() => document.getElementById('me-btn')?.title);
  console.log('1) KLAIM & LEVEL:', a0, '→', JSON.stringify(a1), '→ setelah nonton:', a2);

  // unduhan MP4 per episode + nama berkas bersih
  await p.goto(B + '/#/watch?slug=mao&num=3&title=MAO', { waitUntil: 'domcontentloaded' });
  await wait(22000);
  await p.evaluate(() => document.getElementById('a-dl')?.click());
  await wait(12000);
  console.log('2) PANEL UNDUHAN:', JSON.stringify(await p.evaluate(() => ({
    grup: [...document.querySelectorAll('.dl-q')].slice(0, 3).map((x) => x.textContent.trim()),
    langsung: document.querySelectorAll('.dl-link.direct').length,
  }))));
  console.log('3) NAMA BERKAS:', await p.evaluate(async () => {
    const a = document.querySelector('.dl-link.direct');
    const r = await fetch(a.getAttribute('href'), { headers: { Range: 'bytes=0-500' } });
    await r.arrayBuffer();
    return (r.headers.get('content-disposition') || '').slice(0, 70) + ' | status ' + r.status;
  }));
  await p.screenshot({ path: '/home/user/kelasnime/test/akhir-unduh-mp4.png' });

  // komentar per episode dengan nama akun
  await p.evaluate(() => { const t = document.getElementById('c-text'); if (t) { t.value = 'Komentar episode 3 dari Zoro'; t.dispatchEvent(new Event('input', { bubbles: true })); } });
  await p.evaluate(() => document.getElementById('c-send')?.click());
  await wait(5000);
  console.log('4) KOMENTAR:', JSON.stringify(await p.evaluate(async () => {
    const r = await (await fetch('/api/comments?key=' + encodeURIComponent('ep:mao:3'))).json();
    return (r.items || []).map((c) => c.name + ': ' + c.text.slice(0, 30));
  })));

  // halaman anime tanpa komentar
  await p.goto(B + '/#/anime/mao', { waitUntil: 'domcontentloaded' });
  await wait(18000);
  console.log('5) HALAMAN ANIME:', JSON.stringify(await p.evaluate(() => ({
    formKomentar: !!document.querySelector('.c-form'),
    daftarKomentar: !!document.getElementById('c-list'),
    episode: document.querySelectorAll('#ep-list .ep-item').length,
  }))));
  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join(' | ') : 'tidak ada');
  await b.close();
})();
