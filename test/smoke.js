// Smoke test: render beberapa view pakai jsdom untuk menangkap error runtime.
const { JSDOM, VirtualConsole } = require('jsdom');

const ORIGIN = 'http://127.0.0.1:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

  const dom = await JSDOM.fromURL(`${ORIGIN}/`, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;
  window.fetch = (u, o) => fetch(new URL(u, ORIGIN), o);
  window.scrollTo = () => {};

  const routes = [
    '#/home',
    '#/search?q=frieren',
    '#/anime/samehadaku/sousou-no-frieren-season-2',
    '#/meta/mal52991',
    '#/schedule',
    '#/ongoing',
    '#/movies',
    '#/watch?src=samehadaku&slug=sousou-no-frieren-season-2&title=Frieren&poster=&num=1&url=https%3A%2F%2Fv2.samehadaku.how%2Fsousou-no-frieren-season-2-episode-1%2F',
  ];

  for (const r of routes) {
    window.location.hash = r;
    window.dispatchEvent(new window.Event('hashchange'));
    await wait(9000);
    const app = window.document.getElementById('app');
    const txt = (app.textContent || '').replace(/\s+/g, ' ').trim();
    console.log(`\n=== ${r} ===`);
    console.log('panjang HTML:', app.innerHTML.length);
    console.log('cuplikan:', txt.slice(0, 220));
  }

  console.log('\n=== ERROR JS ===');
  console.log(errors.length ? errors.join('\n') : 'tidak ada');
  dom.window.close();
}

run().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
