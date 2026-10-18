// Audit ringan: cek overflow horizontal, gambar rusak, dan request gagal di tiap halaman.
const puppeteer = require('puppeteer');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ORIGIN = 'http://127.0.0.1:3000';

const routes = [
  ['home', '#/home', 9000],
  ['search', '#/search?q=frieren', 8000],
  ['detail', '#/anime/samehadaku/sousou-no-frieren-season-2', 10000],
  ['meta', '#/meta/al154587', 9000],
  ['ongoing', '#/ongoing', 9000],
  ['schedule', '#/schedule', 9000],
  ['watch', '#/watch?src=samehadaku&slug=sousou-no-frieren-season-2&title=Frieren&poster=&num=1&url=https%3A%2F%2Fv2.samehadaku.how%2Fsousou-no-frieren-season-2-episode-1%2F', 14000],
];

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 850 });
  const failed = [];
  page.on('requestfailed', (r) => failed.push(`FAILED ${r.url().slice(0, 110)} :: ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url().slice(0, 110)}`);
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  for (const [name, hash, t] of routes) {
    failed.length = 0;
    await page.goto(ORIGIN + '/' + hash, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await wait(t);
    const info = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')];
      const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src).slice(0, 4);
      const frame = document.querySelector('.player-frame iframe, .player-frame video');
      const chips = document.querySelectorAll('.server-chip').length;
      return {
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        appW: document.querySelector('.app')?.getBoundingClientRect().width,
        imgs: imgs.length,
        broken,
        player: frame ? frame.tagName + ' ' + Math.round(frame.getBoundingClientRect().width) + 'x' + Math.round(frame.getBoundingClientRect().height) : null,
        serverChips: chips,
        appTextLen: document.getElementById('app')?.textContent.trim().length,
      };
    });
    console.log(`\n[${name}] lebar dokumen=${info.scrollW} (viewport ${info.innerW}) app=${Math.round(info.appW)} | img=${info.imgs} rusak=${info.broken.length} | teks=${info.appTextLen}`);
    if (info.broken.length) console.log('  gambar rusak:', info.broken);
    if (info.player) console.log('  player:', info.player, '| server chips:', info.serverChips);
    const uniq = [...new Set(failed)].slice(0, 6);
    if (uniq.length) console.log('  request gagal:\n   ' + uniq.join('\n   '));
  }
  console.log('\npageerror:', errors.length ? errors.join('\n') : 'tidak ada');
  await browser.close();
})();
