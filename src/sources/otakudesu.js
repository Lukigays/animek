/**
 * KelasNime adapter untuk scraper Otakudesu terlampir oleh pengguna.
 * Referensi parser: /uploads/otakudesu.js. URL asli hanya dipakai server-side;
 * API aplikasi tetap mengirim token opaque ke browser.
 */
const { fetchHtml } = require('../http');
const { cache } = require('../cache');
const { probeAll } = require('../probe');

const BASE = (process.env.OTAKUDESU_BASE || 'https://otakudesu.blog').replace(/\/$/, '');
const CREATOR = 't.me/luyatiem';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36';

const decode = (s = '') => String(s)
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const clean = (s = '') => decode(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const pick = (s, re) => String(s || '').match(re)?.[1] || '';
const absolute = (u, base = BASE) => { if (!u) return ''; try { return new URL(decode(u), base).toString(); } catch { return ''; } };
const slugFromUrl = (url = '') => {
  try { const p = new URL(url, BASE).pathname.split('/').filter(Boolean); return p[p.length - 1] || ''; }
  catch { return String(url).split('/').filter(Boolean).pop() || ''; }
};

function parseCards(html, type = 'ongoing') {
  return String(html).split(/<li><div class=['"]detpost['"]>/i).slice(1).map((chunk) => {
    const epz = clean(pick(chunk, /<div class=['"]epz['"]>([\s\S]*?)<\/div>/i));
    const tipe = clean(pick(chunk, /<div class=['"]epztipe['"]>([\s\S]*?)<\/div>/i));
    const rawUrl = pick(chunk, /<a href=["']([^"']+)["']/i);
    const url = absolute(rawUrl);
    const title = clean(pick(chunk, /<h2 class=["']jdlflm["']>([\s\S]*?)<\/h2>/i));
    if (!url || !title) return null;
    const item = {
      title, url, slug: slugFromUrl(url),
      poster: absolute(pick(chunk, /<img[^>]+src=["']([^"']+)["']/i)),
      date: clean(pick(chunk, /<div class=["']newnime["']>([\s\S]*?)<\/div>/i)),
      source: 'otakudesu',
    };
    return type === 'ongoing'
      ? { ...item, episode: epz, day: tipe }
      : { ...item, episodes: epz, score: tipe };
  }).filter(Boolean);
}
function parseHome(html) {
  const idx = String(html).indexOf('Complete Anime</h1>');
  return {
    ongoing: parseCards(idx >= 0 ? html.slice(0, idx) : html, 'ongoing'),
    complete: parseCards(idx >= 0 ? html.slice(idx) : '', 'complete'),
  };
}
function parseSearch(html) {
  return [...String(html).matchAll(/<li[^>]*>\s*<img[^>]+src=["']([^"']+)["'][^>]*>\s*<h2><a href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a><\/h2>([\s\S]*?)<\/li>/gi)]
    .map((m) => {
      const info = {};
      for (const s of m[4].matchAll(/<div class=["']set["']><b>([^<]+)<\/b>\s*:?\s*([\s\S]*?)<\/div>/gi)) {
        info[clean(s[1]).toLowerCase()] = clean(s[2]).replace(/^:\s*/, '');
      }
      const url = absolute(m[2]);
      return { title: clean(m[3]), url, slug: slugFromUrl(url), poster: absolute(m[1]), ...info, source: 'otakudesu' };
    }).filter((x) => x.title && x.url);
}
function parseDetail(html, pageUrl = BASE) {
  const info = {};
  for (const m of String(html).matchAll(/<p[^>]*>\s*<span[^>]*>\s*<b>([^<]+)<\/b>\s*:\s*([\s\S]*?)<\/span>\s*<\/p>/gi)) {
    info[clean(m[1]).toLowerCase()] = clean(m[2]);
  }
  const start = String(html).search(/class=["']episodelist["']/i);
  const area = start >= 0 ? String(html).slice(start) : String(html);
  const seen = new Set();
  const episodes = [];
  for (const m of area.matchAll(/<a[^>]+href=["']([^"']*\/episode\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>(?:\s*<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>)?/gi)) {
    const url = absolute(m[1], pageUrl);
    const title = clean(m[2]);
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    const n = Number((title.match(/episode\s*(\d+(?:\.\d+)?)/i) || url.match(/episode[-/](\d+(?:\.\d+)?)/i) || [])[1]);
    episodes.push({ title, number: Number.isFinite(n) && n > 0 ? n : episodes.length + 1, url, date: clean(m[3]) });
  }
  episodes.sort((a, b) => a.number - b.number);
  const ogTitle = clean(pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)).replace(/\s*[-|:].*Otakudesu.*$/i, '');
  const title = clean(pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)) || ogTitle || clean(pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i)).replace(/\s*[-|:].*Otakudesu.*$/i, '');
  const genres = [...String(html).matchAll(/<a[^>]+href=["'][^"']*\/genre\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => clean(m[1])).filter(Boolean);
  return {
    title, url: pageUrl,
    poster: absolute(pick(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) || pick(html, /<img[^>]+class=["'][^"']*wp-post-image[^"']*["'][^>]+src=["']([^"']+)/i), pageUrl),
    synopsis: clean(pick(html, /<div class=["']sinopc["']>([\s\S]*?)<\/div>/i)) || decode(pick(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)/i)),
    status: info.status || info.statusanime || '',
    genres: [...new Set(genres)], info,
    totalEpisodes: episodes.length ? String(episodes.length) : (info.episode || info.episodes || ''),
    episodes,
  };
}
function parseEpisode(html, pageUrl) {
  const start = String(html).search(/class=["']download["']/i);
  const part = start >= 0 ? String(html).slice(start) : String(html);
  const downloads = [...part.matchAll(/<li[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>([\s\S]*?)<\/li>/gi)].map((m) => ({
    quality: clean(m[1]),
    size: clean(pick(m[2], /<i[^>]*>([\s\S]*?)<\/i>/i)),
    links: [...m[2].matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((a) => ({ host: clean(a[2]), url: absolute(a[1], pageUrl) })),
  })).filter((x) => x.links.length);
  const streamRaw = pick(html, /<iframe[^>]+src=["']([^"']+)["']/i);
  const links = [];
  if (!downloads.length) {
    const seen = new Set();
    for (const a of String(html).matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = absolute(a[1], pageUrl);
      if (url && !seen.has(url)) { seen.add(url); links.push({ host: clean(a[2]), url }); }
    }
  }
  return { title: clean(pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)), stream: absolute(streamRaw, pageUrl), downloads, links };
}

async function html(url) {
  return fetchHtml(url, {
    timeout: 18000, retries: 1,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
      Referer: `${BASE}/`,
    },
  });
}
async function latest({ page = 1 } = {}) {
  return cache.wrap(`otaku:latest:${page}`, async () => {
    try {
      const home = parseHome(await html(page > 1 ? `${BASE}/page/${Number(page)}/` : `${BASE}/`));
      const items = [...home.ongoing, ...home.complete];
      if (items.length) return items;
    } catch { /* halaman beranda terkadang mendapat challenge */ }
    // Fallback tetap menggunakan parser pencarian Otakudesu (bukan scraper lain).
    const fallback = parseSearch(await html(`${BASE}/?s=anime&post_type=anime`));
    if (!fallback.length) throw new Error('Daftar terbaru Otakudesu sementara tidak tersedia');
    return fallback;
  }, 90 * 1000);
}
async function search(q) {
  const term = String(q || '').trim();
  if (!term) return [];
  return cache.wrap(`otaku:search:${term.toLowerCase()}`, async () => {
    const result = parseSearch(await html(`${BASE}/?s=${encodeURIComponent(term)}&post_type=anime`));
    if (!result.length) throw new Error('Anime tidak ditemukan di Otakudesu');
    return result;
  }, 5 * 60 * 1000);
}
async function detail(slugOrUrl) {
  const url = /^https?:\/\//i.test(String(slugOrUrl || ''))
    ? String(slugOrUrl)
    : `${BASE}/anime/${encodeURIComponent(String(slugOrUrl || '').replace(/^\/+|\/+$/g, ''))}/`;
  if (!cocok(url)) throw new Error('URL bukan halaman Otakudesu');
  return cache.wrap(`otaku:detail:${url}`, async () => {
    const d = parseDetail(await html(url), url);
    if (!d.title) throw new Error('Detail anime Otakudesu tidak terbaca');
    return { ...d, slug: slugFromUrl(url), source: 'otakudesu' };
  }, 15 * 60 * 1000);
}
async function servers(url) {
  return cache.wrap(`otaku:servers:${url}`, async () => {
    const ep = parseEpisode(await html(url), url);
    const raw = [];
    if (ep.stream) raw.push({ name: 'Server 1', url: ep.stream, type: 'embed' });
    for (const group of ep.downloads) {
      for (const link of group.links) raw.push({ name: `${group.quality || 'Server'} ${link.host}`.trim(), url: link.url, type: classify(link.url) });
    }
    for (const link of ep.links) raw.push({ name: link.host || 'Server', url: link.url, type: classify(link.url) });
    const uniq = raw.filter((x, i) => x.url && raw.findIndex((y) => y.url === x.url) === i);
    if (!uniq.length) throw new Error('Server episode tidak ditemukan di Otakudesu');
    const checked = await probeAll(uniq);
    return { source: 'otakudesu', title: ep.title, servers: checked, downloads: ep.downloads, episodeUrl: url };
  }, 5 * 60 * 1000);
}
function classify(url = '') {
  if (/\.m3u8(?:$|\?)/i.test(url)) return 'hls';
  if (/\.(?:mp4|webm|mkv)(?:$|\?)/i.test(url)) return 'mp4';
  return 'embed';
}
function cocok(url = '') { try { return new URL(url).hostname.toLowerCase().endsWith('otakudesu.blog'); } catch { return false; } }

// Bentuk API action mengikuti scraper lampiran agar mudah dipakai terpisah juga.
async function otakudesu(action, query = '') {
  action = String(action || '').toLowerCase();
  query = String(query || '').trim();
  if (action === 'home') return parseHome(await html(`${BASE}/`));
  if (action === 'search') return search(query);
  if (action === 'detail') return detail(query);
  if (action === 'episode') return servers(query);
  if (action === 'ongoing') return parseCards(await html(`${BASE}/ongoing-anime/`), 'ongoing');
  if (action === 'complete') return parseCards(await html(`${BASE}/complete-anime/`), 'complete');
  throw new Error(`Command '${action}' tidak ditemukan.`);
}
const episodeLinks = servers;
const animeLinks = detail;

module.exports = { id: 'otakudesu', label: 'Anime', base: () => BASE, latest, search, detail, servers, cocok, otakudesu, episodeLinks, animeLinks, _parse: { parseCards, parseHome, parseSearch, parseDetail, parseEpisode, decode, clean }, _creator: CREATOR };
