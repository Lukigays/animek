// Uji posisi tegak: pemutar tanpa kabut + lanjut dari menit terakhir (tahan lambat).
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3000';
const SLUG = 'mao', NUM = 3;
const KEY = `kelasnime:pos:${SLUG}:${NUM}`;

(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  await p.setViewport({ width: 390, height: 920, deviceScaleFactor: 2 }); // posisi tegak
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('requestfailed', (r) => { const t = r.failure()?.errorText || ''; if (!/ABORTED/.test(t)) errs.push('gagal: ' + r.url().slice(0, 55) + ' ' + t); });

  const buka = async () => {
    await p.goto(B + '/#/watch?slug=' + SLUG + '&num=' + NUM + '&title=MAO', { waitUntil: 'domcontentloaded' });
  };
  const diIframe = async (fn, tungguSiap = true) => {
    for (let i = 0; i < 90; i++) {
      const frames = await p.frames();
      const fr = frames.find((f) => f.url().includes('/api/embed'));
      if (fr) {
        try {
          const v = await fr.evaluate(() => { const v = document.getElementById('v'); return v ? { rs: v.readyState, d: v.duration, e: !!v.error } : null; });
          if (!tungguSiap || (v && v.rs >= 2 && v.d > 0)) return await fr.evaluate(fn);
        } catch (e) {}
      }
      await wait(1000);
    }
    return { __gagal: 'video tidak siap' };
  };

  await buka();
  await wait(3000);

  // 1) mode nonton aktif + nol kabut di atas area video (posisi tegak)
  const perf = await p.evaluate(() => {
    const wrap = document.querySelector('.player-wrap');
    const r = wrap ? wrap.getBoundingClientRect() : null;
    const bertumpuk = [];
    if (r) {
      for (const el of document.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        const bf = s.backdropFilter || s.webkitBackdropFilter;
        if (!bf || bf === 'none') continue;
        const e = el.getBoundingClientRect();
        const silang = e.width > 0 && e.height > 0 && e.top < r.bottom && e.bottom > r.top && e.left < r.right && e.right > r.left;
        if (silang || s.position === 'fixed') bertumpuk.push(el.className || el.tagName);
      }
    }
    const kaca = (sel) => { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); return s.backdropFilter || s.webkitBackdropFilter; };
    return {
      modeNonton: document.body.classList.contains('watch'),
      kabutDiAtasVideo: bertumpuk.length,
      daftar: bertumpuk.slice(0, 5),
      wrap: kaca('.player-wrap'),
      navBawah: kaca('.bottom-nav'),
      iframeAda: !!document.querySelector('#frame iframe'),
    };
  });
  console.log('1) TEGAK/TANPA KABUT:', JSON.stringify(perf));

  // 2) kelancaran: selang antar-frame saat video berjalan
  await diIframe(() => { const v = document.getElementById('v'); v.muted = true; v.play().catch(() => {}); return 1; });
  const frame = await p.evaluate(async () => {
    const t = [];
    await new Promise((res) => { const tick = (ts) => { t.push(ts); if (ts - t[0] > 2000) res(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    let lambat = 0;
    for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > 50) lambat++;
    return { frame: t.length, detik: ((t[t.length - 1] - t[0]) / 1000).toFixed(1), lambat };
  });
  console.log('2) KELANCARAN TEGAK:', JSON.stringify(frame));

  // 3) simpan posisi di menit 95 → muat ulang → harus lanjut, bukan dari awal
  await diIframe(() => { const v = document.getElementById('v'); v.currentTime = 95; return 1; });
  let simpanan = null;
  for (let i = 0; i < 20 && !simpanan; i++) { await wait(1000); simpanan = await p.evaluate((k) => localStorage.getItem(k), KEY); }
  await buka();
  const toast = await (async () => {
    for (let i = 0; i < 60; i++) {
      const t = await p.evaluate(() => { const e = document.getElementById('lanjut'); return e && getComputedStyle(e).display !== 'none' ? e.textContent.trim() : ''; });
      if (t) return t;
      await wait(500);
    }
    return '';
  })();
  const lanjut = await diIframe(() => { const v = document.getElementById('v'); v.muted = true; v.play().catch(() => {}); return { t: Number(v.currentTime.toFixed(1)), d: Number(v.duration.toFixed(1)) }; });
  console.log('3) LANJUT LAGI:', JSON.stringify({ simpanan, toast, lanjut }));

  // 4) habis tamat → posisi dihapus (nonton ulang mulai dari awal)
  if (lanjut && lanjut.d > 60) {
    await diIframe(() => { const v = document.getElementById('v'); v.currentTime = v.duration - 2; return 1; });
    await wait(9000);
    const sisa = await p.evaluate((k) => localStorage.getItem(k), KEY);
    console.log('4) HABIS TAMAT:', JSON.stringify({ sisa }));
  }

  console.log('ERROR JS:', errs.length ? errs.slice(0, 3) : 'tidak ada');
  await p.screenshot({ path: __dirname + '/tegak-lancar.png' });
  await b.close();
})();
