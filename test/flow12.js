// Uji lencana level + bingkai di komentar pada halaman detail anime
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3000';
(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 900 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await p.goto(B + '/#/profil', { waitUntil: 'domcontentloaded' });
  await wait(8000);
  await p.evaluate(() => { const i = document.getElementById('prof-name'); if (i) { i.value = 'Kazuya'; i.dispatchEvent(new Event('change', { bubbles: true })); } });
  await p.evaluate(() => document.getElementById('demo-login')?.click());
  await wait(3000);
  // naikkan level supaya bingkai berubah (Lvl 5 = bingkai perunggu/2)
  await p.evaluate(async () => {
    for (let i = 0; i < 9; i++) {
      await fetch('/api/me/exp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('kelasnime:token') }, body: JSON.stringify({ amount: 100, reason: 'watch' }) });
    }
  });
  // buka anime dari beranda
  await p.evaluate(() => (location.hash = '#/home'));
  await wait(13000);
  const slug = await p.evaluate(() => document.querySelector('.card[data-go="anime"]')?.dataset.slug);
  console.log('slug:', slug);
  await p.evaluate((s) => (location.hash = '#/anime/' + s), slug);
  await wait(14000);
  // kirim komentar lewat API yang sama dengan UI lalu segarkan tampilan
  const key = 'anime:' + slug;
  await p.evaluate(async (k) => {
    await fetch('/api/comments', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('kelasnime:token') }, body: JSON.stringify({ key: k, text: 'Nonton bareng yuk, seru banget' }) });
  }, key);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await wait(14000);
  console.log('KOMENTAR DI UI:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.comment')].slice(0, 3).map((c) => ({
    nama: c.querySelector('.c-head b')?.textContent,
    lencana: c.querySelector('.c-lvl')?.textContent,
    bingkai: c.querySelector('.c-av')?.className.replace('c-av ', ''),
    teks: c.querySelector('.c-text')?.textContent.slice(0, 40),
  }))), null, 1));
  console.log('HEADER:', await p.evaluate(() => document.getElementById('me-btn')?.title + ' | gelar ' + document.getElementById('me-title')?.textContent + ' | ' + document.getElementById('me-av')?.className));
  await p.screenshot({ path: '/home/user/kelasnime/test/shot-komentar.png', fullPage: false });
  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join(' | ') : 'tidak ada');
  await b.close();
})();
