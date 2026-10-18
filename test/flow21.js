// Uji: lanjut otomatis dari menit terakhir + pemutar tanpa blur + crop banner.
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:3000';
(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  await p.setCacheEnabled(false);
  await p.setViewport({ width: 390, height: 920, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

  const url = B + '/#/watch?slug=mao&num=3&title=MAO';
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await wait(16000);

  // 1) blur pemutar harus none + video di iframe ada
  const luar = await p.evaluate(() => {
    const w = getComputedStyle(document.querySelector('.player-wrap'));
    const f = document.querySelector('#frame iframe');
    return { blurWrap: w.backdropFilter || w.webkitBackdropFilter, adaIframe: !!f };
  });
  console.log('1) LUAR:', JSON.stringify(luar));

  const diIframe = async (fn) => {
    const frames = await p.frames();
    const fr = frames.find((f) => f.url().includes('/api/embed'));
    if (!fr) return null;
    return fr.evaluate(fn);
  };

  // 2) putar (diizinkan autoplay), maju ke ~70 dtk, biarkan posisi tersimpan
  const st1 = await diIframe(() => {
    const v = document.getElementById('v');
    v.muted = true;
    v.play().catch(() => {});
    return { src: v.currentSrc || v.src, tipe: v.tagName };
  });
  await wait(4000);
  await diIframe(() => { const v = document.getElementById('v'); v.currentTime = 70; });
  await wait(7000); // beberapa timeupdate → simpanPos jalan
  const pos = await diIframe(() => {
    const v = document.getElementById('v');
    const kunci = Object.keys(localStorage).find((k) => k.startsWith('kelasnime:pos:'));
    return { t: v.currentTime, simpanan: localStorage.getItem(kunci || ''), crop: getComputedStyle(v).transform.slice(0, 26) };
  });
  console.log('2) POSISI TERSIMPAN:', JSON.stringify(pos));

  // 3) muat ulang → harus lanjut dari ~70 dtk
  await p.goto('about:blank');
  await wait(600);
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await wait(16000);
  const st2 = await (async () => {
    const frames = await p.frames();
    const fr = frames.find((f) => f.url().includes('/api/embed'));
    if (!fr) return { gagal: 'iframe tidak ada' };
    await wait(4000);
    return fr.evaluate(() => {
      const v = document.getElementById('v');
      return { t: v.currentTime, toast: document.getElementById('lanjut')?.textContent || '' };
    });
  })();
  console.log('3) SETELAH MUAT ULANG:', JSON.stringify(st2));
  await p.screenshot({ path: '/home/user/kelasnime/test/lanjut-posisi.png' });

  console.log('ERROR JS:', errs.length ? [...new Set(errs)].join(' | ') : 'tidak ada');
  await b.close();
})();
