// Uji tata letak baru: kartu akun, misi, TOP NAKAMA, Global Chat, tanpa label TV
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3000';
(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 900 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 100)); });

  await p.goto(B + '/#/home', { waitUntil: 'domcontentloaded' });
  await wait(15000);
  console.log('URUTAN BERANDA:', JSON.stringify(await p.evaluate(() => ({
    judul: [...document.querySelectorAll('.section-head h2')].map((h) => h.textContent.trim()),
    searchPlaceholder: document.getElementById('search-input')?.placeholder,
    lebar: document.documentElement.scrollWidth,
  })), null, 1));
  console.log('KARTU AKUN:', JSON.stringify(await p.evaluate(() => ({
    nama: document.querySelector('.acc-name')?.textContent.replace(/\s+/g, ' ').trim(),
    lvl: document.querySelector('.acc-lvl')?.textContent.replace(/\s+/g, ' ').trim(),
    bar: document.querySelector('.acc-bar i')?.style.width,
    stats: [...document.querySelectorAll('.acc-stats div')].map((d) => d.textContent.replace(/\s+/g, ' ').trim()),
    tombol: document.querySelector('.acc-cta')?.textContent,
  })), null, 1));
  console.log('MISI:', JSON.stringify(await p.evaluate(() => ({
    judul: document.querySelector('.mission-main b')?.textContent,
    sub: document.querySelector('.mission-main span')?.textContent,
    go: document.querySelector('.mission-go')?.textContent,
  }))));

  // kirim pesan global chat (tamu)
  await p.evaluate(() => { const i = document.getElementById('gchat-input'); if (i) i.value = 'Halo semuanya, ini pesan uji'; });
  await p.evaluate(() => document.getElementById('gchat-send')?.click());
  await wait(3000);
  console.log('GLOBAL CHAT:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#gchat .chat-row')].map((r) => ({
    nama: r.querySelector('.chat-main b')?.textContent.replace(/\s+/g, ' ').trim(),
    pesan: r.querySelector('.chat-main small')?.textContent.slice(0, 40),
    waktu: r.querySelector('.chat-time')?.textContent,
  }))), null, 1));

  // cek moderasi di global chat
  await p.evaluate(() => { const i = document.getElementById('gchat-input'); if (i) i.value = 'anjing, nonton di https://a.com/x'; });
  await p.evaluate(() => document.getElementById('gchat-send')?.click());
  await wait(3000);
  console.log('MODERASI CHAT:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#gchat .chat-row small')].map((s) => s.textContent.slice(0, 45)))));

  // halaman chat penuh
  await p.evaluate(() => (location.hash = '#/chat'));
  await wait(4000);
  console.log('HALAMAN CHAT:', JSON.stringify(await p.evaluate(() => ({
    judul: document.querySelector('.section-head h2')?.textContent,
    jumlah: document.querySelectorAll('#c-list .comment').length,
    form: !!document.getElementById('c-send'),
  }))));

  // detail anime: pastikan tidak ada label "TV"
  await p.evaluate(() => (location.hash = '#/home'));
  await wait(12000);
  const slug = await p.evaluate(() => document.querySelector('.card[data-go="anime"]')?.dataset.slug);
  if (slug) {
    await p.evaluate((s) => (location.hash = '#/anime/' + s), slug);
    await wait(13000);
    console.log('DETAIL:', JSON.stringify(await p.evaluate(() => ({
      judul: document.querySelector('.detail-head h1')?.textContent.slice(0, 40),
      pill: [...document.querySelectorAll('.detail-head .pill')].map((x) => x.textContent.trim()),
      adaTV: document.body.innerText.split(/\s+/).includes('TV'),
    }))));
  }
  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join(' | ') : 'tidak ada');
  await b.close();
})();
