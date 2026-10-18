// Uji tiga entry point: standalone (server.js), Vercel (api/index.js), Netlify (function handler)
const http = require('http');

function listen(app, port) {
  return new Promise((res) => {
    const s = app.listen(port, '127.0.0.1', () => res(s));
  });
}
function get(port, path) {
  return new Promise((res, rej) => {
    http
      .get({ host: '127.0.0.1', port, path }, (r) => {
        let b = '';
        r.setEncoding('utf8');
        r.on('data', (c) => (b += c));
        r.on('end', () => res({ status: r.statusCode, type: r.headers['content-type'], len: b.length, head: b.slice(0, 90) }));
      })
      .on('error', rej);
  });
}

(async () => {
  // 1. Vercel entry
  const vercelApp = require('../api/index.js');
  const s1 = await listen(vercelApp, 3311);
  console.log('[vercel] /            ', JSON.stringify(await get(3311, '/')));
  console.log('[vercel] /style.css   ', JSON.stringify(await get(3311, '/style.css')));
  console.log('[vercel] /api/status  ', JSON.stringify(await get(3311, '/api/status')));
  console.log('[vercel] /api/latest  ', JSON.stringify(await get(3311, '/api/latest')));
  s1.close();

  // 2. Standalone entry
  const standalone = require('../app.js');
  const s2 = await listen(standalone, 3312);
  console.log('[app]    /            ', JSON.stringify(await get(3312, '/')));
  console.log('[app]    /app.js      ', JSON.stringify(await get(3312, '/app.js')));
  console.log('[app]    /halaman-apa ', JSON.stringify(await get(3312, '/halaman-apa')));
  s2.close();

  // 3. Netlify handler (event palsu ala API Gateway)
  const { handler } = require('../netlify/functions/api.js');
  const evt = (p, qs = null) => ({
    path: p,
    httpMethod: 'GET',
    headers: { host: 'x.netlify.app', 'user-agent': 'test' },
    queryStringParameters: qs,
    body: null,
    isBase64Encoded: false,
  });
  for (const p of ['/api/status', '/api/latest']) {
    const out = await handler(evt(p), {});
    const body = out.isBase64Encoded ? Buffer.from(out.body, 'base64').toString() : out.body;
    console.log('[netlify]', p, '->', out.statusCode, '|', body.slice(0, 80).replace(/\s+/g, ' '));
  }
  process.exit(0);
})();
