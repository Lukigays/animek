// Scraper Samehadaku (v2.samehadaku.how), diadaptasi untuk antarmuka KelasNime.
const { load } = require('cheerio');
const { fetchHtml } = require('../http');
const { cache } = require('../cache');
const { probeAll } = require('../probe');

const BASE = (process.env.SAMEHADAKU_BASE || 'https://v2.samehadaku.how').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
const txt = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const abs = (u, b = BASE) => { if (!u) return ''; try { return new URL(u, b).toString(); } catch { return ''; } };
const slugFromUrl = (u = '') => { try { return decodeURIComponent(new URL(u, BASE).pathname.split('/').filter(Boolean).pop() || ''); } catch { return ''; } };
const noSub = (s) => txt(s).replace(/\s*(?:sub\s*indo|subtitle\s*indonesia)\s*$/i, '').trim();

async function get(url) {
  return fetchHtml(url, {
    timeout: 20000,
    retries: 1,
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      Referer: `${BASE}/`,
    },
  });
}
function numberFrom(s, fallback = 0) {
  const m = String(s || '').match(/(?:episode|ep\.?)[\s#-]*(\d+(?:\.\d+)?)/i) || String(s || '').match(/-episode-(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : fallback;
}
function imageOf($node) {
  const img = $node.find('img').first();
  return abs(img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src') || '');
}
function parseLatest(html) {
  const $ = load(html);
  const items = [];
  $('.latestepisode_widget li, #latestanime li').each((_, li) => {
    const $li = $(li);
    const animeA = $li.find('.dtla h2.entry-title a[href*="/anime/"]').first();
    const epA = $li.find('.thumb a[href]').first();
    const animeUrl = abs(animeA.attr('href'));
    const epUrl = abs(epA.attr('href'));
    const title = noSub(animeA.attr('title') || animeA.text() || epA.attr('title'));
    if (!title || !animeUrl) return;
    const episode = numberFrom($li.find('.dtla').text(), numberFrom(epUrl, 0)) || null;
    const timeText = $li.find('.dtla').text().match(/Released on:\s*([^\n]+)/i)?.[1] || '';
    items.push({
      title,
      slug: slugFromUrl(animeUrl),
      poster: imageOf($li),
      episode,
      status: 'Ongoing',
      released: txt(timeText),
      source: 'samehadaku',
    });
  });
  if (items.length) return unique(items);
  return parseAnimeCards(html);
}
function parseAnimeCards(html) {
  const $ = load(html);
  const items = [];
  $('article.animepost, article.post').each((_, el) => {
    const $el = $(el);
    const a = $el.find('a[href*="/anime/"]').has('.content-thumb').first();
    const url = abs(a.attr('href'));
    const title = noSub(a.attr('title') || $el.find('.data .title h2').first().text());
    if (!url || !title) return;
    const rating = txt($el.find('.score').first().text()).replace(/[^\d.]/g, '');
    const status = txt($el.find('.data .type').last().text()) || txt($el.find('.typez').text());
    items.push({ title, slug: slugFromUrl(url), poster: imageOf($el), score: rating, status, url, source: 'samehadaku' });
  });
  return unique(items);
}
function parseSearch(html) { return parseAnimeCards(html); }
function parseDetail(html, detailUrl) {
  const $ = load(html);
  const title = noSub($('main h1').first().text() || $('h1.entry-title').first().text() || $('meta[property="og:title"]').attr('content'));
  const poster = abs($('meta[property="og:image"]').attr('content') || $('.thumb img.anmsa').first().attr('src') || $('img.wp-post-image').first().attr('src'));
  const info = {};
  const detailHeading = $('h3').filter((_, h) => /detail anime/i.test($(h).text())).first();
  if (detailHeading.length) {
    const $grid = detailHeading.parent().find('.grid').first();
    $grid.children('div').each((_, row) => {
      const spans = $(row).find('span');
      const key = txt(spans.eq(0).text()).replace(/:$/, '');
      const value = txt(spans.eq(1).text());
      if (key) info[key] = value;
    });
  }
  const synopsis = [];
  $('.entry-content-single').first().find('p').each((_, p) => {
    const t = txt($(p).text());
    if (!t || /^(sinopsis|judul lengkap)\s*:?$/i.test(t)) return;
    if (/sinopsis\s*:/i.test(t)) synopsis.push(t.replace(/^.*?sinopsis\s*:\s*/i, ''));
    else if (synopsis.length || !/judul lengkap/i.test(t)) synopsis.push(t);
  });
  const $epHeading = $('h3').filter((_, h) => /list episode/i.test($(h).text())).first();
  const $epBox = $epHeading.parent();
  const seen = new Set();
  const episodes = [];
  $epBox.find('a[href*="-episode-"]').each((_, a) => {
    const url = abs($(a).attr('href'));
    if (!url || seen.has(url)) return;
    seen.add(url);
    const text = txt($(a).text()) || txt($(a).attr('title'));
    const number = numberFrom(text, numberFrom(url, episodes.length + 1));
    episodes.push({ number, title: text || `${title} Episode ${number}`, date: txt($(a).closest('li, .flex, div').find('.date').first().text()), url });
  });
  episodes.sort((a, b) => a.number - b.number);
  const genres = [];
  $('a[href*="/genre/"]').each((_, a) => { const g = txt($(a).text()); if (g && !genres.includes(g)) genres.push(g); });
  return {
    title, slug: slugFromUrl(detailUrl), url: detailUrl, poster,
    synopsis: txt(synopsis.join(' ')), genres, info,
    status: info.Status || info.status || '',
    totalEpisodes: String(episodes.length || ''), episodes,
    source: 'samehadaku',
  };
}
function classify(url = '') {
  if (/\.m3u8(?:$|\?)/i.test(url)) return 'hls';
  if (/\.(?:mp4|webm|mkv)(?:$|\?)/i.test(url)) return 'mp4';
  return 'embed';
}
function parseServers(html, episodeUrl) {
  const $ = load(html);
  const rows = [];
  $('.player-server-btn').each((_, el) => {
    const $el = $(el);
    if ($el.hasClass('disabled')) return;
    const name = txt($el.text()) || 'Server';
    const direct = abs($el.attr('data-url'), episodeUrl);
    const embedMarkup = $el.attr('data-embed') || '';
    let embedded = '';
    if (embedMarkup) {
      try { const $embed = load(embedMarkup); embedded = abs($embed('iframe').attr('src') || $embed('source').attr('src'), episodeUrl); } catch { /* ignore malformed embed */ }
    }
    const url = direct || embedded;
    if (url) rows.push({ name, url, type: classify(url) });
  });
  if (!rows.length) {
    const iframe = abs($('.player-area iframe, iframe').first().attr('src'), episodeUrl);
    if (iframe) rows.push({ name: 'Server', url: iframe, type: classify(iframe) });
  }
  const downloads = [];
  $('.download-eps').each((_, group) => {
    const $group = $(group);
    const title = txt($group.find('p b').first().text()) || 'Unduhan';
    $group.find('li').each((__, li) => {
      const quality = txt($(li).find('strong').first().text());
      $(li).find('.download-eps-links a[href]').each((___, a) => {
        downloads.push({ quality: `${title} ${quality}`.trim(), name: txt($(a).text()), url: abs($(a).attr('href'), episodeUrl) });
      });
    });
  });
  return { title: noSub($('h1.entry-title').first().text()), servers: uniqueByUrl(rows), downloads, episodeUrl };
}
const unique = (items) => items.filter((x, i) => items.findIndex((y) => y.slug === x.slug && y.episode === x.episode) === i);
const uniqueByUrl = (items) => items.filter((x, i) => items.findIndex((y) => y.url === x.url) === i);

async function latest({ page = 1 } = {}) {
  return cache.wrap(`sh:latest:${page}`, async () => {
    const url = Number(page) > 1 ? `${BASE}/anime-terbaru/page/${Number(page)}/` : `${BASE}/`;
    const items = parseLatest(await get(url));
    if (!items.length) throw new Error('Daftar terbaru Samehadaku kosong');
    return items;
  }, 90 * 1000);
}
async function search(query) {
  const q = txt(query);
  if (!q) return [];
  return cache.wrap(`sh:search:${q.toLowerCase()}`, async () => {
    const items = parseSearch(await get(`${BASE}/?s=${encodeURIComponent(q)}&post_type=anime`));
    if (!items.length) throw new Error('Anime tidak ditemukan di Samehadaku');
    return items;
  }, 5 * 60 * 1000);
}
async function catalog({ status = 'all', page = 1 } = {}) {
  const st = /^(ongoing|complete)$/.test(String(status)) ? String(status) : 'all';
  const p = Math.max(1, Number(page) || 1);
  return cache.wrap(`sh:catalog:${st}:${p}`, async () => {
    const url = p > 1 ? `${BASE}/daftar-anime-2/page/${p}/` : `${BASE}/daftar-anime-2/`;
    let items = parseAnimeCards(await get(url));
    if (st !== 'all') items = items.filter((x) => st === 'complete' ? /complete|tamat|finished/i.test(x.status || '') : /ongoing|airing/i.test(x.status || ''));
    return items;
  }, 10 * 60 * 1000);
}
async function detail(slugOrUrl) {
  const url = /^https?:\/\//i.test(String(slugOrUrl || '')) ? String(slugOrUrl) : `${BASE}/anime/${encodeURIComponent(String(slugOrUrl || '').replace(/^\/+|\/+$/g, ''))}/`;
  if (!cocok(url)) throw new Error('URL bukan halaman Samehadaku');
  return cache.wrap(`sh:detail:${url}`, async () => {
    const d = parseDetail(await get(url), url);
    if (!d.title) throw new Error('Detail anime Samehadaku tidak terbaca');
    return d;
  }, 15 * 60 * 1000);
}
async function servers(url) {
  return cache.wrap(`sh:servers:${url}`, async () => {
    const data = parseServers(await get(url), url);
    if (!data.servers.length) throw new Error('Server episode tidak ditemukan di Samehadaku');
    data.servers = await probeAll(data.servers);
    return data;
  }, 5 * 60 * 1000);
}
function cocok(url = '') { try { return /(^|\.)samehadaku\.how$/i.test(new URL(url).hostname); } catch { return false; } }

module.exports = { id: 'samehadaku', label: 'Anime', base: () => BASE, latest, search, catalog, detail, servers, cocok, _parse: { parseLatest, parseAnimeCards, parseSearch, parseDetail, parseServers } };
