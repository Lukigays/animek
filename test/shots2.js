const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3000';
(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 920, deviceScaleFactor: 2 });
  await p.goto(B + '/#/profil', { waitUntil: 'domcontentloaded' });
  await wait(8000);
  await p.evaluate(() => { const i = document.getElementById('prof-name'); if (i) { i.value = 'Nakama'; i.dispatchEvent(new Event('change', { bubbles: true })); } });
  await p.evaluate(() => document.getElementById('demo-login')?.click());
  await wait(3500);
  await p.evaluate(async () => {
    for (let i = 0; i < 8; i++) await fetch('/api/me/exp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('kelasnime:token') }, body: JSON.stringify({ amount: 100, reason: 'watch' }) });
    await fetch('/api/clan', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('kelasnime:token') }, body: JSON.stringify({ name: 'Nakama Nime', tag: 'NKMA' }) });
    await fetch('/api/comments', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('kelasnime:token') }, body: JSON.stringify({ key: 'global', text: 'Waduh, endingnya bikin merinding!' }) });
  });
  await p.evaluate(() => (location.hash = '#/home'));
  await wait(15000);
  await p.screenshot({ path: '/home/user/kelasnime/test/shot-home-baru.png' });
  await p.evaluate(() => document.querySelector('.ranks')?.scrollIntoView({ block: 'center' }));
  await wait(1200);
  await p.screenshot({ path: '/home/user/kelasnime/test/shot-top-chat.png' });
  await p.evaluate(() => (location.hash = '#/chat'));
  await wait(4000);
  await p.screenshot({ path: '/home/user/kelasnime/test/shot-chat.png' });
  console.log('selesai');
  await b.close();
})();
