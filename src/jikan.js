// Client Jikan v4 — metadata anime (MAL).
// Jikan punya limit ±3 req/detik & 60 req/menit untuk IP publik,
// jadi semua request di-antrekan + di-cache.
const { request, sleep } = require('./http');
const { cache } = require('./cache');

const BASE = 'https://api.jikan.moe/v4';
const MIN_GAP = 420; // ms antar request

let chain = Promise.resolve();
let lastCall = 0;

function serialize(fn) {
  const run = chain.then(async () => {
    const wait = Math.max(0, MIN_GAP - (Date.now() - lastCall));
    if (wait) await sleep(wait);
    lastCall = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

async function jikan(path, { ttl = 30 * 60 * 1000, retries = 1 } = {}) {
  const cacheKey = `jikan:${path}`;
  return cache.wrap(
    cacheKey,
    async () => {
      let lastErr;
      for (let i = 0; i <= retries; i++) {
        try {
          const res = await serialize(() => request(`${BASE}${path}`, { timeout: 12000, retries: 0, curlFallback: true }));
          if (res.status === 429 || res.status === 503) {
            await sleep(1200 * (i + 1));
            continue;
          }
          if (!res.ok) {
            const body = (() => {
              try {
                return JSON.parse(res.text);
              } catch {
                return {};
              }
            })();
            throw new Error(body?.message || `Jikan error ${res.status}`);
          }
          return JSON.parse(res.text);
        } catch (err) {
          lastErr = err;
          if (i < retries) await sleep(600 * (i + 1));
        }
      }
      throw lastErr;
    },
    ttl
  );
}

const qs = (obj = {}) => {
  const u = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  });
  const s = u.toString();
  return s ? `?${s}` : '';
};

module.exports = {
  jikan,
  search: (q, opts = {}) => jikan(`/anime${qs({ q, limit: opts.limit || 12, sfw: true })}`, { ttl: 30 * 60 * 1000 }),
  top: (opts = {}) =>
    jikan(`/top/anime${qs({ type: opts.type, filter: opts.filter, page: opts.page || 1, limit: opts.limit || 20 })}`, {
      ttl: 30 * 60 * 1000,
    }),
  seasonsNow: (page = 1) => jikan(`/seasons/now${qs({ page, limit: 24 })}`, { ttl: 60 * 60 * 1000 }),
  seasonsUpcoming: (page = 1) => jikan(`/seasons/upcoming${qs({ page, limit: 24 })}`, { ttl: 60 * 60 * 1000 }),
  byId: (id) => jikan(`/anime/${id}/full`, { ttl: 12 * 60 * 60 * 1000 }),
  byIdLite: (id) => jikan(`/anime/${id}`, { ttl: 12 * 60 * 60 * 1000 }),
  episodes: (id, page = 1) => jikan(`/anime/${id}/episodes${qs({ page })}`, { ttl: 60 * 60 * 1000 }),
  characters: (id) => jikan(`/anime/${id}/characters`, { ttl: 12 * 60 * 60 * 1000 }),
  recommendations: (id) => jikan(`/anime/${id}/recommendations`, { ttl: 12 * 60 * 60 * 1000 }),
  schedule: (day) => jikan(`/schedules${qs({ filter: day, sfw: true, limit: 25 })}`, { ttl: 60 * 60 * 1000 }),
  genres: () => jikan(`/genres/anime${qs({ filter: 'genres' })}`, { ttl: 24 * 60 * 60 * 1000 }),
  byGenre: (id, page = 1) => jikan(`/anime${qs({ genres: id, page, limit: 24, sfw: true })}`, { ttl: 60 * 60 * 1000 }),
  random: () => jikan(`/random/anime`, { ttl: 0 }),
};
