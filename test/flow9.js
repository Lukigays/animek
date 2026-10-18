// Uji akhir: login demo -> komentar dimoderasi -> profil -> clan, di backend MongoDB
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
  await wait(8000);
  await p.evaluate(() => { const i = document.getElementById('prof-name'); if (i) { i.value = 'Nakama'; i.dispatchEvent(new Event('change', { bubbles: true })); } });
  await p.evaluate(() => document.getElementById('demo-login')?.click());
  await wait(3500);
  console.log('PROFIL:', JSON.stringify(await p.evaluate(() => ({
    nama: document.querySelector('.prof-name-static')?.textContent,
    sub: document.querySelector('.prof-sub')?.textContent,
    lvl: document.querySelector('.lvl-top')?.textContent.replace(/\s+/g, ' '),
    clan: document.querySelector('.clan-mini')?.textContent.replace(/\s+/g, ' ').trim(),
    header: document.getElementById('me-btn')?.title,
  })), null, 1));
  // komentar lewat halaman detail (ambil anime dari beranda)
  await p.evaluate(() => (location.hash = '#/home'));
  await wait(12000);
  const slug = await p.evaluate(() => document.querySelector('.card[data-go="anime"]')?.dataset.slug);
  console.log('SLUG ANIME:', slug);
  if (slug) {
    await p.evaluate((s) => (location.hash = '#/anime/' + s), slug);
    await wait(14000);
    console.log('JUDUL:', await p.evaluate(() => document.querySelector('.det-title, .d-title, h1')?.textContent?.slice(0, 60)));
    // kirim komentar pakai API yang sama dengan UI (agar badge moderasi terlihat)
    const posted = await p.evaluate(async (slug) => {
      const key = 'anime:' + slug;
      const send = (text) =>
        fetch('/api/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('kelasnime:token') },
          body: JSON.stringify({ key, text, name: 'Nakama' }),
        }).then((r) => r.json());
      const a = await send('Gila anjing, nonton di https://contoh.com/nonton seru banget!!!');
      await new Promise((r) => setTimeout(r, 500));
      const b = await send('Anime ini bagus banget, recommended');
      await new Promise((r) => setTimeout(r, 500));
      const c = await send('Anime ini bagus banget, recommended');
      return { kasar: a, normal: b, duplikat: c };
    }, slug);
    console.log('KOMENTAR KASAR :', JSON.stringify(posted.kasar?.item && { text: posted.kasar.item.text, flags: posted.kasar.item.flags }));
    console.log('KOMENTAR NORMAL:', JSON.stringify(posted.normal?.item && { text: posted.normal.item.text, flags: posted.normal.item.flags }));
    console.log('DUPLIKAT DITOLAK:', JSON.stringify(posted.duplikat));
    // muat ulang halaman agar komentar dari server dirender
    await p.reload({ waitUntil: 'domcontentloaded' });
    await wait(14000);
    console.log('KOMENTAR DI UI:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.comment .c-text')].map((t) => t.textContent.slice(0, 60))), null, 1));
    console.log('BADGE MODERASI:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.c-flag')].map((f) => f.textContent))));
    console.log('HEADER SETELAH KOMENTAR:', await p.evaluate(() => document.getElementById('me-btn')?.title));
  }
  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join('\n') : 'tidak ada');
  await b.close();
})();
