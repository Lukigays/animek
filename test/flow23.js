// Uji pasti (tanpa host luar): pemutar tanpa kabut + lanjut dari menit terakhir
// + posisi dihapus setelah tamat. Memakai sumber uji lokal (UJI_LOKAL=1).
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3100';
const KEY = 'kelasnime:pos:uji:1';

(async () => {
  // ambil token episode dari API, seperti yang dipakai daftar episode asli
  const data = await (await fetch(B + '/api/anime?slug=uji')).json();
  const ep = data.data.episodes.find((e) => Number(e.number) === 1);
  const url = `${B}/#/watch?slug=uji&num=1&title=${encodeURIComponent('Uji Pemutar')}&e=${encodeURIComponent(ep.e)}`;

  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  await p.setViewport({ width: 390, height: 920, deviceScaleFactor: 2 }); // posisi tegak
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('requestfailed', (r) => { const t = r.failure()?.errorText || ''; if (!/ABORTED/.test(t)) errs.push('gagal: ' + r.url().slice(0, 50) + ' ' + t); });

  const diIframe = async (fn, tungguSiap = true) => {
    for (let i = 0; i < 40; i++) {
      const fr = (await p.frames()).find((f) => f.url().includes('/api/embed'));
      if (fr) {
        try {
          const v = await fr.evaluate(() => { const v = document.getElementById('v'); return v ? { rs: v.readyState, d: v.duration } : null; });
          if (!tungguSiap || (v && v.rs >= 2 && v.d > 0)) return await fr.evaluate(fn);
        } catch (e) {}
      }
      await wait(750);
    }
    return { __gagal: 'video tidak siap' };
  };

  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await wait(6000);

  // 1) posisi tegak: mode nonton + nol kabut di atas area video
  const perf = await p.evaluate(() => {
    const r = document.querySelector('.player-wrap')?.getBoundingClientRect();
    const daftar = [];
    if (r) for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      const bf = s.backdropFilter || s.webkitBackdropFilter;
      if (!bf || bf === 'none') continue;
      const e = el.getBoundingClientRect();
      const silang = e.width > 0 && e.height > 0 && e.top < r.bottom && e.bottom > r.top && e.left < r.right && e.right > r.left;
      if (silang || s.position === 'fixed') daftar.push(el.className || el.tagName);
    }
    return { modeNonton: document.body.classList.contains('watch'), kabut: daftar.length, daftar, iframe: !!document.querySelector('#frame iframe') };
  });
  console.log('1) TEGAK/TANPA KABUT:', JSON.stringify(perf));

  // 1b) anime tanpa lanjutan: bagian "Anime Terkait" tidak boleh muncul
  const terkait = await p.evaluate(() => {
    const teks = document.body.innerText;
    return { adaCariEpisode: /cari episode/i.test(teks), adaTerkait: /anime terkait/i.test(teks), seksi: [...document.querySelectorAll('.section h2')].map((h) => h.textContent.trim()) };
  });
  console.log('1b) TANPA LANJUTAN:', JSON.stringify(terkait));

  // 2) simpan otomatis tiap 5 dtk: putar 12 dtk -> posisi harus tersimpan
  await diIframe(() => { const v = document.getElementById('v'); v.muted = true; v.play().catch(() => {}); return 1; });
  await wait(12000);
  const auto = await p.evaluate((k) => localStorage.getItem(k), KEY);
  await diIframe(() => { const v = document.getElementById('v'); v.currentTime = 50; return 1; });
  await wait(7000);
  const simpan = await p.evaluate((k) => localStorage.getItem(k), KEY);
  console.log('2) TERSIMPAN:', JSON.stringify({ otomatis: auto, diMenit50: simpan }));

  // 3) kelancaran di posisi tegak
  const lancar = await p.evaluate(async () => {
    const t = [];
    await new Promise((res) => { const tick = (ts) => { t.push(ts); if (ts - t[0] > 2000) res(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    let lambat = 0;
    for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > 50) lambat++;
    return { frame: t.length, detik: ((t[t.length - 1] - t[0]) / 1000).toFixed(1), patah: lambat };
  });
  console.log('3) KELANCARAN TEGAK:', JSON.stringify(lancar));

  // 4) buka lagi episode yang sama -> harus lanjut dari menit terakhir, bukan dari awal
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  const toast = await (async () => {
    for (let i = 0; i < 40; i++) {
      const t = await p.evaluate(() => { const e = document.getElementById('lanjut'); return e && getComputedStyle(e).display !== 'none' ? e.textContent.trim() : ''; });
      if (t) return t;
      await wait(500);
    }
    return '';
  })();
  const lanjut = await diIframe(() => { const v = document.getElementById('v'); v.muted = true; v.play().catch(() => {}); return { t: Number(v.currentTime.toFixed(1)), d: Number(v.duration.toFixed(1)) }; });
  console.log('4) BUKA LAGI:', JSON.stringify({ toast, lanjut, dariAwal: lanjut && lanjut.t < 5 }));

  // 5) habis tamat -> posisi dihapus (nonton ulang mulai dari awal)
  await diIframe(() => { const v = document.getElementById('v'); v.currentTime = v.duration - 1.5; return 1; });
  await wait(8000);
  const sisa = await p.evaluate((k) => localStorage.getItem(k), KEY);
  console.log('5) HABIS TAMAT:', JSON.stringify({ sisa }));

  console.log('ERROR JS:', errs.length ? errs.slice(0, 3) : 'tidak ada');
  await p.screenshot({ path: __dirname + '/tegak-lancar.png' });
  await b.close();
})();
