// Uji permintaan tampilan baru:
//  - label jenis hanya "Movie" / "Anime" (tidak ada OVA/ONA/Spesial/Musik/Seri)
//  - tidak ada tombol "Cari Episode"; ada daftar episode 1 -> tamat siap putar
//  - "Anime Terkait" hanya muncul kalau ada lanjutan (S2/S3, sekuel, prekuel)
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3000';
const SLUG = 'kimetsu-no-yaiba';

(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  await p.setViewport({ width: 390, height: 920, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

  // ---------- 1) BERANDA ----------
  await p.goto(B + '/#/home', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 40; i++) {
    const ada = await p.evaluate(() => !!document.querySelector('.hero-cta .btn'));
    if (ada) break;
    await wait(1500);
  }
  const beranda = await p.evaluate(() => {
    const teks = document.body.innerText;
    return {
      adaCariEpisode: /cari episode/i.test(teks),
      ctaHero: [...document.querySelectorAll('.hero-cta .btn')].map((b) => b.textContent.trim()),
      labelJenis: [...new Set([...document.querySelectorAll('.card .sub')].map((e) => e.textContent.replace(/·.*/, '').trim()))],
    };
  });
  console.log('1) BERANDA:', JSON.stringify(beranda));

  // ---------- 2) HERO: "Tonton" -> langsung daftar episode 1..tamat ----------
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('.hero-cta .btn')].find((b) => /tonton/i.test(b.textContent));
    btn?.click();
  });
  let hash = '';
  for (let i = 0; i < 90; i++) {
    hash = await p.evaluate(() => location.hash);
    if (/^#\/anime\//.test(hash)) break;
    await wait(1000);
  }
  await wait(6000);
  const halaman = await p.evaluate(() => {
    const items = [...document.querySelectorAll('#ep-list .ep-item')];
    return {
      hash: location.hash,
      judul: document.querySelector('.detail-head h1')?.textContent || '',
      adaCariEpisode: /cari episode/i.test(document.body.innerText),
      jumlahEp: items.length,
      pertama: items[0]?.dataset.ep || '',
      terakhir: items.length ? items[items.length - 1].dataset.ep : '',
    };
  });
  console.log('2) HERO -> EPISODE:', JSON.stringify(halaman));

  // ---------- 3) HALAMAN NONTON: Anime Terkait hanya kalau ada lanjutan ----------
  const bacaTerkait = async (slug) => {
    await p.goto(B + '/#/anime/' + slug, { waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 30; i++) {
      const adaEp = await p.evaluate(() => !!document.querySelector('#ep-list .ep-item'));
      if (adaEp) break;
      await wait(1500);
    }
    return p.evaluate(() => {
      const seksi = [...document.querySelectorAll('.section')].find((x) => /anime terkait/i.test(x.querySelector('h2')?.textContent || ''));
      const kartu = seksi ? [...seksi.querySelectorAll('.card')].map((c) => ({
        judul: c.querySelector('.title')?.textContent || '',
        badge: c.querySelector('.badge')?.textContent?.trim() || '',
      })) : [];
      return { adaSeksi: !!seksi, kartu };
    });
  };
  const ada = await bacaTerkait('maou-gakuin-no-futekigousha');       // punya lanjutan (S2)
  const tidak = await bacaTerkait('jujutsu-kaisen');                   // tanpa relasi lanjutan
  console.log('3) ANIME TERKAIT:', JSON.stringify({ adaSeksi: ada.adaSeksi, kartu: ada.kartu.slice(0, 3), tanpaLanjutan: tidak }));
  const badgeDipakai = [...ada.kartu.map((k) => k.badge), ...tidak.kartu.map((k) => k.badge)].filter(Boolean);
  console.log('3b) BADGE:', JSON.stringify([...new Set(badgeDipakai)]));

  // ---------- 4) HALAMAN INFO: episode langsung tampil, tanpa tombol cari ----------
  await p.goto(B + '/#/meta/al101922', { waitUntil: 'domcontentloaded' });
  let siap = null;
  for (let i = 0; i < 90; i++) {
    siap = await p.evaluate(() => {
      const btn = document.getElementById('play-meta');
      const sec = document.getElementById('ep-meta');
      const items = [...document.querySelectorAll('#ep-meta-list .ep-item')];
      return {
        teksTombol: btn?.textContent.trim() || '',
        adaCariEpisode: /cari episode/i.test(document.body.innerText),
        epTampil: sec && !sec.hidden,
        jumlahEp: items.length,
        pertama: items[0]?.dataset.n || '',
        terakhir: items.length ? items[items.length - 1].dataset.n : '',
        labelJenis: [...document.querySelectorAll('.detail-head .pill')].map((e) => e.textContent.trim()),
        adaTerkait: [...document.querySelectorAll('.section h2')].some((h) => /anime terkait/i.test(h.textContent)),
      };
    });
    if (siap && siap.jumlahEp > 0) break;
    await wait(2000);
  }
  console.log('4) HALAMAN INFO:', JSON.stringify(siap));

  // ---------- 5) klik episode -> langsung ke pemutar ----------
  await p.evaluate(() => document.querySelector('#ep-meta-list .ep-item')?.click());
  await wait(1500);
  const kePemutar = await p.evaluate(() => location.hash);
  console.log('5) KLIK EPISODE:', kePemutar.slice(0, 90));

  console.log('ERROR JS:', errs.length ? errs.slice(0, 3) : 'tidak ada');
  await p.screenshot({ path: __dirname + '/tampilan-baru.png' });
  await b.close();
})();
