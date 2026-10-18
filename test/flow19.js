// Uji: tanpa tombol unduh, kartu → detail, halaman nonton ada unduhan + komentar, detail ala Wibuku
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

  // 1) tab Terbaru: klik kartu → harus ke halaman detail
  await p.goto(B + '/#/ongoing', { waitUntil: 'domcontentloaded' });
  await wait(16000);
  const kartu = await p.evaluate(() => {
    const c = document.querySelector('.card');
    return { go: c?.dataset.go, slug: c?.dataset.slug, judul: c?.querySelector('.title')?.textContent };
  });
  await p.evaluate(() => document.querySelector('.card')?.click());
  await wait(6000);
  console.log('1) KLIK KARTU:', JSON.stringify(kartu), '→ hash:', await p.evaluate(() => location.hash.slice(0, 40)));

  // 2) halaman detail: sinopsis, anime terkait (S2/S3), episode + tanggal
  await p.goto(B + '/#/anime/hell-mode', { waitUntil: 'domcontentloaded' });
  await wait(22000);
  console.log('2) DETAIL:', JSON.stringify(await p.evaluate(() => ({
    judul: document.querySelector('.detail-head h1')?.textContent?.slice(0, 40),
    sinopsis: (document.getElementById('synopsis')?.textContent || '').slice(0, 60),
    bagian: [...document.querySelectorAll('.section-head h2')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
    terkait: [...document.querySelectorAll('.section')].find((s) => /Terkait/i.test(s.querySelector('h2')?.textContent || ''))
      ? [...document.querySelectorAll('.section')].find((s) => /Terkait/i.test(s.querySelector('h2')?.textContent || ''))
          .querySelectorAll('.card .title').length
      : 0,
    badgeTerkait: [...document.querySelectorAll('.badge.rel')].map((x) => x.textContent.trim()).slice(0, 4),
    episode: document.querySelectorAll('#ep-list .ep-item').length,
    contohTanggal: document.querySelector('#ep-list .ep-item small')?.textContent,
    tombolUnduh: !!document.getElementById('btn-dl'),
  }), null, 1)));
  await p.screenshot({ path: '/home/user/kelasnime/test/detail-wibuku.png' });

  // 3) halaman nonton: tanpa tombol unduh, ada bagian unduhan + komentar
  await p.goto(B + '/#/watch?slug=mao&num=3&title=MAO', { waitUntil: 'domcontentloaded' });
  await wait(22000);
  console.log('3) HALAMAN NONTON:', JSON.stringify(await p.evaluate(() => ({
    tombolUnduh: !!document.getElementById('a-dl'),
    bagian: [...document.querySelectorAll('.section-head h2')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
    linkUnduh: document.querySelectorAll('#watch-download .dl-link').length,
    linkLangsung: document.querySelectorAll('#watch-download .dl-link.direct').length,
    komentar: !!document.getElementById('c-list'),
    formKomentar: !!document.querySelector('.c-form'),
  }), null, 1)));
  await p.evaluate(() => window.scrollTo(0, 900));
  await wait(1500);
  await p.screenshot({ path: '/home/user/kelasnime/test/nonton-gulir.png' });

  // 4) movie: tidak boleh "Episode (0)"
  const movie = await p.evaluate(async () => {
    const r = await fetch('/api/anime?slug=tensei-shitara-slime-datta-ken-movie-2-soukai-no-namida-hen').then((x) => x.json()).catch(() => null);
    if (!r || !r.ok) return 'slug tidak ditemukan';
    return { judul: r.data.title?.slice(0, 40), episode: (r.data.episodes || []).length, total: r.data.totalEpisodes };
  });
  console.log('4) MOVIE:', JSON.stringify(movie));
  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join(' | ') : 'tidak ada');
  await b.close();
})();
