// Uji: scraper baru (NontonAnime/MP4), klaim & level, komentar wajib login + nama akun, komentar cuma per episode
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
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 80)); });

  // --- TAMU: tidak boleh komentar ---
  await p.goto(B + '/#/watch?slug=mao&num=1&title=MAO', { waitUntil: 'domcontentloaded' });
  await wait(18000);
  console.log('1) TAMU DI HALAMAN NONTON:', JSON.stringify(await p.evaluate(() => ({
    pesanLogin: !!document.querySelector('.c-login'),
    teksLogin: document.querySelector('.c-login span')?.textContent?.slice(0, 46),
    tombolKirim: !!document.getElementById('c-send'),
    textareaDimatikan: document.getElementById('c-text')?.disabled,
  }))));
  const tolakTamu = await p.evaluate(async () => {
    const r = await fetch('/api/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ep:mao:1', text: 'Coba tanpa login' }) });
    return r.status + ' ' + JSON.stringify(await r.json()).slice(0, 70);
  });
  console.log('2) TAMU KIRIM KOMENTAR DITOLAK:', tolakTamu);

  // --- LOGIN ---
  await p.goto(B + '/#/profil', { waitUntil: 'domcontentloaded' });
  await wait(8000);
  await p.evaluate(() => { const i = document.getElementById('prof-name'); if (i) { i.value = 'Luffy'; i.dispatchEvent(new Event('change', { bubbles: true })); } });
  await p.evaluate(() => document.getElementById('demo-login')?.click());
  await wait(3500);
  console.log('3) SETELAH LOGIN:', await p.evaluate(() => document.getElementById('me-btn')?.title));

  // --- KLAIM HARIAN ---
  await p.evaluate(() => (location.hash = '#/home'));
  await wait(13000);
  const sblm = await p.evaluate(() => document.getElementById('me-btn')?.title);
  await p.evaluate(() => document.getElementById('home-checkin')?.click());
  await wait(4500);
  console.log('4) KLAIM:', sblm, '→', await p.evaluate(() => ({
    header: document.getElementById('me-btn')?.title,
    tombol: document.getElementById('home-checkin')?.textContent?.trim(),
    dimatikan: document.getElementById('home-checkin')?.disabled,
  })));

  // --- KOMENTAR SETELAH LOGIN: nama dari akun ---
  await p.goto(B + '/#/watch?slug=mao&num=2&title=MAO', { waitUntil: 'domcontentloaded' });
  await wait(18000);
  console.log('5) FORM KOMENTAR (LOGIN):', JSON.stringify(await p.evaluate(() => ({
    identitas: document.querySelector('.c-me b')?.textContent,
    gelar: document.querySelector('.c-me .c-lvl')?.textContent,
    tombolKirim: !!document.getElementById('c-send'),
  }))));
  await p.evaluate(() => { const t = document.getElementById('c-text'); if (t) { t.value = 'Komentar dari akun Luffy episode 2'; t.dispatchEvent(new Event('input', { bubbles: true })); } });
  await p.evaluate(() => document.getElementById('c-send')?.click());
  await wait(5000);
  console.log('6) KOMENTAR TERKIRIM:', JSON.stringify(await p.evaluate(async () => {
    const r = await fetch('/api/comments?key=' + encodeURIComponent('ep:mao:2'));
    const j = await r.json();
    return (j.items || []).map((c) => c.name + ': ' + c.text.slice(0, 34));
  })));

  // --- halaman anime TIDAK punya kolom komentar ---
  await p.goto(B + '/#/anime/mao', { waitUntil: 'domcontentloaded' });
  await wait(18000);
  console.log('7) HALAMAN ANIME:', JSON.stringify(await p.evaluate(() => ({
    formKomentar: !!document.querySelector('.c-form'),
    daftarKomentar: !!document.getElementById('c-list'),
    catatan: document.querySelector('.c-note.pad')?.textContent?.trim().slice(0, 50),
    jumlahEpisode: document.querySelectorAll('#ep-list .ep-item').length,
  }))));

  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join(' | ') : 'tidak ada');
  await b.close();
})();
