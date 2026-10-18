// Uji: balas komentar (nested), tombol lapor, dan halaman profil
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 400, height: 850 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 110)); });
  p.on('dialog', async (d) => { await d.accept(); }); // konfirmasi "laporkan"

  await p.goto('http://127.0.0.1:3000/#/anime/sousou-no-frieren-season-2', { waitUntil: 'domcontentloaded' });
  await wait(20000);

  // --- kirim komentar utama ---
  await p.evaluate(() => {
    document.getElementById('c-name').value = 'Uji Balas';
    document.getElementById('c-text').value = 'Komentar utama dari tes';
    document.getElementById('c-send').click();
  });
  await wait(3500);

  // --- balas komentar pertama ---
  const replyOk = await p.evaluate(() => {
    const btn = document.querySelector('.comment .c-reply');
    if (!btn) return false;
    btn.click();
    return true;
  });
  await wait(800);
  const formShown = await p.evaluate(() => !!document.querySelector('.c-reply-form textarea'));
  await p.evaluate(() => {
    const ta = document.querySelector('.c-reply-form textarea');
    if (ta) ta.value = 'Ini balasan level 1';
    document.querySelector('.c-send-reply')?.click();
  });
  await wait(3500);

  // --- balas balasan (level 2) ---
  await p.evaluate(() => {
    const nested = document.querySelector('.c-replies .comment .c-reply');
    if (nested) nested.click();
  });
  await wait(800);
  await p.evaluate(() => {
    const ta = document.querySelector('.c-replies .c-reply-form textarea');
    if (ta) ta.value = 'Balasan level 2 (nested)';
    document.querySelector('.c-replies .c-send-reply')?.click();
  });
  await wait(3500);

  const tree = await p.evaluate(() => ({
    roots: document.querySelectorAll('.c-list > .comment').length,
    repliesL1: document.querySelectorAll('.c-list > .comment > .c-body > .c-replies > .comment').length,
    repliesL2: document.querySelectorAll('.c-replies .c-replies .comment').length,
    texts: [...document.querySelectorAll('.c-text')].map((t) => t.textContent.slice(0, 34)).slice(0, 5),
    replyButtons: document.querySelectorAll('.c-reply').length,
    reportButtons: document.querySelectorAll('.c-report').length,
  }));
  console.log('STRUKTUR BALASAN:', JSON.stringify({ replyOk, formShown, ...tree }, null, 1));

  // --- tombol lapor ---
  await p.evaluate(() => {
    const rs = [...document.querySelectorAll('.c-report')];
    if (rs.length) rs[rs.length - 1].click();
  });
  await wait(3000);
  console.log('SETELAH LAPOR:', JSON.stringify(await p.evaluate(() => ({
    reportedLabels: [...document.querySelectorAll('.c-report.on')].map((x) => x.textContent.trim()),
    hidden: document.querySelectorAll('.comment.c-hidden').length,
  }))));

  // --- halaman profil lewat tombol atas ---
  await p.evaluate(() => document.getElementById('prof-btn')?.click());
  await wait(3000);
  const prof = await p.evaluate(() => ({
    hash: location.hash,
    name: document.getElementById('prof-name')?.value,
    stats: [...document.querySelectorAll('.prof-stats b')].map((x) => x.textContent),
    statLabels: [...document.querySelectorAll('.prof-stats span')].map((x) => x.textContent),
    tabs: [...document.querySelectorAll('.tab')].map((x) => x.textContent.trim()),
    rows: [...document.querySelectorAll('.prof-row')].slice(0, 4).map((r) => ({
      t: r.querySelector('.prof-row-title')?.textContent.slice(0, 30),
      m: r.querySelector('.prof-row-meta')?.textContent.slice(0, 28),
    })),
    docWidth: document.documentElement.scrollWidth,
  }));
  console.log('PROFIL:', JSON.stringify(prof, null, 1));

  // pindah tab
  for (const tab of ['suka', 'riwayat']) {
    await p.evaluate((t) => document.querySelector('.tab[data-tab="' + t + '"]')?.click(), tab);
    await wait(1200);
    console.log('TAB ' + tab + ':', JSON.stringify(await p.evaluate(() => ({
      rows: document.querySelectorAll('.prof-row').length,
      first: document.querySelector('.prof-row-title')?.textContent.slice(0, 32) || document.querySelector('.empty')?.textContent.slice(0, 40),
    }))));
  }

  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join('\n') : 'tidak ada');
  await b.close();
})();
