// Cek cepat apakah sebuah URL stream/embed masih hidup (dipanggil dari scraper).
const { UA } = require('./http');
const { cache } = require('./cache');

async function probe(url, type = 'embed', timeout = 5000) {
  if (!url) return { alive: false, framable: true, status: 0 };
  return cache.wrap(
    `probe:${type}:${url}`,
    async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const headers = { 'User-Agent': UA, Accept: '*/*' };
        if (type !== 'embed') headers.Range = 'bytes=0-1';
        const res = await fetch(url, { method: 'GET', headers, redirect: 'follow', signal: ctrl.signal });
        clearTimeout(timer);
        const xfo = (res.headers.get('x-frame-options') || '').toLowerCase();
        const cspFrame = (res.headers.get('content-security-policy') || '');
        const framable = !/(^|\s)(deny|sameorigin)(\s|$)/.test(xfo) && !/frame-ancestors\s+'none'/.test(cspFrame);
        return { alive: res.status < 400, framable, status: res.status };
      } catch {
        clearTimeout(timer);
        return { alive: false, framable: true, status: 0 };
      }
    },
    15 * 60 * 1000
  );
}

async function probeAll(servers = [], limit = 8) {
  const out = new Array(servers.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, servers.length) }, async () => {
    for (;;) {
      const i = idx++;
      if (i >= servers.length) return;
      out[i] = { ...servers[i], ...(await probe(servers[i].url, servers[i].type)) };
    }
  });
  await Promise.all(workers);

  const rank = (s) => {
    if (!s) return 99;
    if (s.alive && (s.type === 'hls' || s.type === 'mp4')) return 0;
    if (s.alive && s.framable) return 1;
    if (s.alive) return 2;
    if (s.status === 0) return 3; // tidak bisa dicek dari server (mungkin jalan di browser user)
    return 4;
  };
  return out.filter(Boolean).sort((a, b) => rank(a) - rank(b));
}

module.exports = { probe, probeAll };
