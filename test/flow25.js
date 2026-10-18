// Uji layar penuh:
//  - tombol ⛶ di halaman benar-benar masuk layar penuh
//  - saat layar penuh, pemutar MENCOBA mengunci orientasi ke landscape
//    (uji di sini: pastikan percobaannya jalan & tidak ada error; di HP Android
//     Chrome kunci ini yang memutar layar jadi miring)
//  - keluar layar penuh -> kunci dilepas
//  - sambil video berjalan di posisi tegak: hitung kelancaran + pastikan tidak
//    ada animasi/kabut yang tersisa di halaman
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3100';

(async () => {
  const j = await (await fetch(B + '/api/anime?slug=uji')).json();
  const e = j.data.episodes[0].e;
  const url = B + '/#/watch?slug=uji&num=1&title=Uji&e=' + encodeURIComponent(e);

  const b = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  await p.setViewport({ width: 390, height: 920, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', (x) => errs.push('pageerror: ' + x.message));

  // catat percobaan kunci orientasi di dalam iframe maupun di halaman induk
  await p.evaluateOnNewDocument(() => {
    window.__kunci = [];
    try {
      if (screen.orientation) {
        const asli = screen.orientation.lock?.bind(screen.orientation);
        if (asli) screen.orientation.lock = (o) => { window.__kunci.push(o); return asli(o).catch(() => {}); };
      }
    } catch {}
  });

  await p.goto(url, { waitUntil: 'domcontentloaded' });
  let siap = null;
  for (let i = 0; i < 40; i++) {
    siap = await p.evaluate(() => !!document.getElementById('a-fs'));
    if (siap) break;
    await wait(1000);
  }

  // jalankan video (agar tombolnya aktif) lalu tekan tombol layar penuh
  const fr = (await p.frames()).find((f) => f.url().includes('/api/embed'));
  if (fr) await fr.evaluate(() => { const v = document.getElementById('v'); v.muted = true; v.play().catch(() => {}); });
  await wait(2500);

  await p.evaluate(() => document.getElementById('a-fs').click());
  await wait(3000);

  const fs = await p.evaluate(() => ({
    indukFs: !!document.fullscreenElement,
    elemen: document.fullscreenElement ? document.fullscreenElement.tagName + (document.fullscreenElement.id ? '#' + document.fullscreenElement.id : '') : '',
    kunciDiInduk: window.__kunci || [],
    kelasFs: document.body.classList.contains('fs'),
    kelasPlaying: document.body.classList.contains('playing'),
  }));
  const fsIframe = fr ? await fr.evaluate(() => ({
    iframeFs: !!document.fullscreenElement,
    kunciDiPemutar: window.__kunci || [],
  })) : null;
  console.log('1) LAYAR PENUH:', JSON.stringify({ ...fs, ...(fsIframe || {}) }));

  // hiasan halaman yang memaksa gambar ulang layar — harus nol
  const sisa = await p.evaluate(() => {
    let anim = 0, kabut = 0;
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (s.animationName && s.animationName !== 'none' && s.animationDuration !== '0s') anim++;
      const bf = s.backdropFilter || s.webkitBackdropFilter;
      if (bf && bf !== 'none') kabut++;
    }
    const se = getComputedStyle(document.body, '::before');
    return { animasi: anim, kabut, latarBelakang: se.visibility };
  });
  console.log('2) HIASAN SISA:', JSON.stringify(sisa));

  // kelancaran saat video berjalan dengan UI web terlihat (bukan layar penuh)
  await p.evaluate(() => document.getElementById('a-fs').click()); // keluar dari layar penuh
  await wait(1500);
  const lancar = await p.evaluate(async () => {
    const t = [];
    await new Promise((res) => {
      const tick = (ts) => { t.push(ts); if (ts - t[0] > 2500) res(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    let patah = 0;
    const jeda = [];
    for (let i = 1; i < t.length; i++) { const d = t[i] - t[i - 1]; jeda.push(Math.round(d)); if (d > 50) patah++; }
    jeda.sort((a, c) => c - a);
    return { frame: t.length, detik: ((t[t.length - 1] - t[0]) / 1000).toFixed(1), patah, jedaTerburuk: jeda.slice(0, 3) };
  });
  console.log('3) KELANCARAN (UI terlihat):', JSON.stringify(lancar));

  const keluar = await p.evaluate(() => ({ indukFs: !!document.fullscreenElement, kelasFs: document.body.classList.contains('fs') }));
  console.log('4) KELUAR LAYAR PENUH:', JSON.stringify(keluar));
  console.log('ERROR JS:', errs.length ? errs.slice(0, 3) : 'tidak ada');
  await b.close();
})();
