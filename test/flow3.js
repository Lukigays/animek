// Uji: series tamat (daftar 1..N), penanda episode ditonton, kartu episode langsung putar
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 850 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));

  // 1. anime tamat: daftar episode 1..10
  await p.goto('http://127.0.0.1:3000/#/anime/sousou-no-frieren-season-2', { waitUntil: 'domcontentloaded' });
  await wait(20000);
  const det = await p.evaluate(() => ({
    title: document.querySelector('.detail-head h1')?.textContent,
    pills: [...document.querySelectorAll('.detail-head .pill')].map((x) => x.textContent.trim()),
    range: document.querySelector('.ep-range')?.textContent.trim(),
    numbers: [...document.querySelectorAll('.ep-item .ep-num')].map((x) => x.textContent),
    progress: document.querySelector('.ep-progress')?.textContent.trim(),
    sortBtn: document.querySelector('#sort-ep')?.textContent.trim(),
  }));
  console.log('DETAIL TAMAT:', JSON.stringify(det));

  // urutkan terbalik
  await p.evaluate(() => document.querySelector('#sort-ep')?.click());
  await wait(600);
  console.log('SETELAH SORT:', JSON.stringify(await p.evaluate(() => ({
    sortBtn: document.querySelector('#sort-ep')?.textContent.trim(),
    first3: [...document.querySelectorAll('.ep-item .ep-num')].slice(0, 3).map((x) => x.textContent),
  }))));

  // 2. nonton episode 3 → cek ditonton
  await p.evaluate(() => {
    const el = [...document.querySelectorAll('.ep-item')].find((x) => x.dataset.ep === '3');
    if (el) el.click();
  });
  await wait(16000);
  const w = await p.evaluate(() => ({
    hash: location.hash.slice(0, 60),
    iframe: document.querySelector('#frame iframe')?.getAttribute('src'),
    watched: JSON.parse(localStorage.getItem('kelasnime:watched') || '{}'),
    history: (JSON.parse(localStorage.getItem('kelasnime:history') || '[]') || []).slice(0, 1),
  }));
  console.log('NONTON EP 3:', JSON.stringify(w));

  // balik ke detail → episode 3 harus ditandai
  await p.goto('http://127.0.0.1:3000/#/anime/sousou-no-frieren-season-2', { waitUntil: 'domcontentloaded' });
  await wait(12000);
  console.log('SETELAH NONTON:', JSON.stringify(await p.evaluate(() => ({
    watchedEps: [...document.querySelectorAll('.ep-item.watched .ep-num')].map((x) => x.textContent),
    current: document.querySelector('.ep-item.current .ep-num')?.textContent,
    progress: document.querySelector('.ep-progress')?.textContent.trim(),
    playLabel: document.querySelector('#play-first')?.textContent.trim(),
  }))));

  // 3. kartu episode dari halaman terbaru (langsung putar)
  await p.goto('http://127.0.0.1:3000/#/ongoing', { waitUntil: 'domcontentloaded' });
  await wait(12000);
  const cards = await p.evaluate(() => ({
    total: document.querySelectorAll('.card').length,
    watchCards: document.querySelectorAll('.card[data-go="watch"]').length,
    animeCards: document.querySelectorAll('.card[data-go="anime"]').length,
  }));
  console.log('TERBARU:', JSON.stringify(cards));
  if (cards.watchCards) {
    await p.evaluate(() => document.querySelector('.card[data-go="watch"]').click());
    await wait(16000);
    console.log('KARTU EPISODE ->', JSON.stringify(await p.evaluate(() => ({
      hash: location.hash.slice(0, 50),
      iframe: document.querySelector('#frame iframe')?.getAttribute('src'),
      chips: [...document.querySelectorAll('.server-chip')].length,
    }))));
  }

  console.log('ERROR JS:', errs.length ? errs.join('\n') : 'tidak ada');
  await b.close();
})();
