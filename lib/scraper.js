import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const SOURCE = 'https://v2.samehadaku.how';
const FALLBACK_PATH = fileURLToPath(new URL('../public/fallback.json', import.meta.url));
const PAGE_TTL = 8 * 60 * 1000;
const pageCache = new Map();
const inFlight = new Map();

const DAY_NAMES = {
  monday: 'Senin',
  tuesday: 'Selasa',
  wednesday: 'Rabu',
  thursday: 'Kamis',
  friday: 'Jumat',
  saturday: 'Sabtu',
  sunday: 'Minggu',
};
const DAY_KEYS = Object.keys(DAY_NAMES);

function cleanText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function searchKey(value = '') {
  return cleanText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('id-ID').replace(/[^\p{L}\p{N}]+/gu, '');
}

function absoluteUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value, `${SOURCE}/`);
    if (url.protocol !== 'https:' || url.hostname !== new URL(SOURCE).hostname) return '';
    return url.href;
  } catch {
    return '';
  }
}

function imageUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value, `${SOURCE}/`);
    if (url.protocol !== 'https:') return '';
    const allowed = url.hostname === new URL(SOURCE).hostname ||
      (/^i[0-3]\.wp\.com$/.test(url.hostname) && /samehadaku/i.test(url.pathname));
    return allowed ? url.href : '';
  } catch {
    return '';
  }
}

function profileKey(value) {
  try {
    return decodeURIComponent(new URL(value, `${SOURCE}/`).pathname)
      .toLowerCase()
      .replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function parseNumber(value) {
  const match = cleanText(value).match(/\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

function loadFallback() {
  return readFile(FALLBACK_PATH, 'utf8').then((value) => JSON.parse(value));
}

async function fetchPage(path, { refresh = false } = {}) {
  const url = path.startsWith('http') ? path : new URL(path, `${SOURCE}/`).href;
  const now = Date.now();
  const existing = pageCache.get(url);

  if (!refresh && existing && now - existing.fetchedAt < PAGE_TTL) {
    return { ...existing, live: true, cached: true, stale: false };
  }

  if (!refresh && inFlight.has(url)) return inFlight.get(url);

  const request = (async () => {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          Referer: `${SOURCE}/`,
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Scraper sumber merespons ${response.status}`);
      const html = await response.text();
      if (html.length < 1000) throw new Error('HTML sumber tidak lengkap');
      const page = { html, fetchedAt: Date.now(), live: true, cached: false, stale: false };
      pageCache.set(url, page);
      return page;
    } catch (error) {
      if (existing) return { ...existing, live: false, cached: true, stale: true, error: error.message };
      throw error;
    } finally {
      inFlight.delete(url);
    }
  })();

  inFlight.set(url, request);
  return request;
}

async function optionalPage(path, options) {
  try {
    return await fetchPage(path, options);
  } catch (error) {
    return { html: '', fetchedAt: 0, live: false, cached: false, stale: false, error: error.message };
  }
}

function parseEpisodeFeed(html) {
  if (!html) return [];
  const $ = load(html);
  const entries = [];
  $('.post-show li[itemscope], li[itemscope][itemtype*="CreativeWork"]').each((_, element) => {
    const item = $(element);
    const titleAnchor = item.find('.dtla .entry-title a').first();
    const imageElement = item.find('.thumb img').first();
    const releaseAnchor = item.find('.thumb > a').first();
    const title = cleanText(titleAnchor.text()) || cleanText(imageElement.attr('alt'));
    const seriesUrl = absoluteUrl(titleAnchor.attr('href'));
    const episodeUrl = absoluteUrl(releaseAnchor.attr('href')) || seriesUrl;
    if (!title || !seriesUrl) return;

    let episode = '';
    let released = '';
    item.find('.dtla > span').each((__, span) => {
      const text = cleanText($(span).text());
      if (!episode && /\bEpisode\b/i.test(text)) {
        episode = text.replace(/^.*?\bEpisode\s*/i, '').trim();
      }
      if (!released && /Released on:/i.test(text)) {
        released = text.split(/Released on:/i).slice(1).join(':').trim();
      }
    });

    entries.push({
      id: profileKey(seriesUrl),
      title,
      href: seriesUrl,
      episodeUrl,
      episode,
      author: cleanText(item.find('.author [itemprop="name"]').first().text()),
      released,
      image: imageUrl(imageElement.attr('src')),
      score: null,
      genres: '',
      type: 'TV',
      day: null,
      time: '',
      status: 'Ongoing',
    });
  });
  return entries;
}

function parseCatalog(html) {
  if (!html) return [];
  const $ = load(html);
  const entries = [];
  $('article.animepost').each((_, element) => {
    const item = $(element);
    const anchor = item.find('.animposx > a[href*="/anime/"]').first();
    const href = absoluteUrl(anchor.attr('href'));
    const title = cleanText(item.find('.data .title h2').first().text()) ||
      cleanText(anchor.attr('title')) || cleanText(anchor.text());
    const poster = item.find('.content-thumb img').first();
    const status = cleanText(item.find('.data .type').first().text());
    if (!title || !href) return;

    entries.push({
      id: profileKey(href),
      title,
      href,
      image: imageUrl(poster.attr('src')),
      score: parseNumber(item.find('.score').first().text()),
      status: status || 'Anime',
      type: cleanText(item.find('.content-thumb .type').first().text()) || 'TV',
      genres: cleanText(item.find('.stooltip .metadata .genre').text()),
      episode: '',
      episodeUrl: href,
      author: '',
      released: '',
      day: null,
      time: '',
    });
  });
  return entries;
}

function parseSchedule(html) {
  const schedule = Object.fromEntries(DAY_KEYS.map((key) => [key, []]));
  if (!html) return schedule;
  const $ = load(html);

  $('.widget.schedule .result-schedule').each((index, element) => {
    const box = $(element);
    const raw = box.attr('x-show') || '';
    const dayMatch = raw.match(/activeDay\s*===\s*['"]([^'"]+)['"]/i);
    const key = (dayMatch?.[1] || DAY_KEYS[index] || '').toLowerCase();
    if (!DAY_NAMES[key]) return;

    box.find('.animepost').each((_, cardElement) => {
      const card = $(cardElement);
      const anchor = card.find('.animposx > a[href*="/anime/"]').first();
      const href = absoluteUrl(anchor.attr('href'));
      const title = cleanText(card.find('.data .title h2').first().text()) ||
        cleanText(anchor.attr('title')) || cleanText(anchor.text());
      const poster = card.find('.content-thumb img').first();
      if (!title || !href) return;

      schedule[key].push({
        id: profileKey(href),
        title,
        href,
        image: imageUrl(poster.attr('src')),
        score: parseNumber(card.find('.score').first().text()),
        genres: cleanText(card.find('.data .type').first().text()),
        type: cleanText(card.find('.content-thumb .type').first().text()) || 'TV',
        time: cleanText(card.find('.ltseps').first().text()),
        day: DAY_NAMES[key],
        status: 'Ongoing',
        episode: '',
        episodeUrl: href,
      });
    });
  });
  return schedule;
}

function parseTopTen(html) {
  if (!html) return [];
  const $ = load(html);
  const entries = [];
  $('.top10-section .topten-animesu li, .topten-animesu li').each((_, element) => {
    const item = $(element);
    const anchor = item.find('a.series').first();
    const href = absoluteUrl(anchor.attr('href'));
    const title = cleanText(item.find('.judul').first().text()) || cleanText(anchor.attr('title'));
    const image = item.find('img').first();
    if (!title || !href) return;
    entries.push({
      id: profileKey(href),
      title,
      href,
      image: imageUrl(image.attr('src')),
      score: parseNumber(item.find('.rating').first().text()),
      rank: entries.length + 1,
    });
  });
  return entries.slice(0, 10);
}

function enrichEpisodes(entries, schedule) {
  const byProfile = new Map();
  for (const day of DAY_KEYS) {
    for (const item of schedule[day] || []) byProfile.set(profileKey(item.href), item);
  }
  return entries.map((entry) => {
    const match = byProfile.get(profileKey(entry.href));
    return {
      ...entry,
      image: match?.image || entry.image,
      score: entry.score || match?.score || null,
      genres: entry.genres || match?.genres || '',
      type: entry.type || match?.type || 'TV',
      day: entry.day || match?.day || null,
      time: entry.time || match?.time || '',
    };
  });
}

function fallbackItems(fallback, view, query = '') {
  if (view === 'ongoing') return fallback.ongoing || fallback.latest || [];
  if (view === 'completed') return fallback.completed || [];
  if (view === 'search') {
    const needle = searchKey(query);
    return [...(fallback.latest || []), ...(fallback.completed || [])]
      .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
      .filter((item) => searchKey(item.title).includes(needle));
  }
  return fallback.latest || [];
}

function emptySchedule(fallback) {
  return fallback.schedule || Object.fromEntries(DAY_KEYS.map((key) => [key, []]));
}

export async function getAnimeData({ view = 'latest', query = '', refresh = false } = {}) {
  const normalizedView = String(view || 'latest').toLowerCase();
  const supportedViews = new Set(['latest', 'home', 'ongoing', 'completed', 'tamat', 'schedule', 'jadwal', 'search']);
  const activeView = supportedViews.has(normalizedView) ? normalizedView : 'latest';
  const fallback = await loadFallback();
  const needsSchedule = ['latest', 'home', 'ongoing', 'schedule', 'jadwal', 'search'].includes(activeView);
  const primaryPath = {
    latest: '/anime-terbaru/',
    home: '/anime-terbaru/',
    ongoing: '/ongoing/',
    completed: '/daftar-anime-2/',
    tamat: '/daftar-anime-2/',
    schedule: '/jadwal-rilis/',
    jadwal: '/jadwal-rilis/',
    search: '/daftar-anime-2/',
  }[activeView];

  const primaryPromise = optionalPage(primaryPath, { refresh });
  const schedulePromise = needsSchedule
    ? optionalPage('/jadwal-rilis/', { refresh })
    : Promise.resolve(null);
  const searchLatestPromise = activeView === 'search'
    ? optionalPage('/anime-terbaru/', { refresh })
    : Promise.resolve(null);
  const [primaryResult, scheduleResult, searchLatestResult] = await Promise.all([
    primaryPromise,
    schedulePromise,
    searchLatestPromise,
  ]);

  const parsedSchedule = scheduleResult ? parseSchedule(scheduleResult.html) : {};
  const scheduleHasItems = Object.values(parsedSchedule).some((items) => items.length > 0);
  const schedule = scheduleHasItems ? parsedSchedule : emptySchedule(fallback);
  const topItems = fallback.top || [];
  let items = [];
  let usedLiveItems = false;

  if (activeView === 'ongoing') {
    const parsed = parseEpisodeFeed(primaryResult?.html || '');
    if (parsed.length) {
      items = enrichEpisodes(parsed, schedule);
      usedLiveItems = Boolean(primaryResult?.live);
    } else {
      items = fallbackItems(fallback, 'ongoing');
    }
  } else if (activeView === 'completed' || activeView === 'tamat') {
    const catalog = parseCatalog(primaryResult?.html || '');
    const completed = catalog.filter((item) => /completed|tamat|selesai/i.test(item.status));
    if (completed.length) {
      items = completed;
      usedLiveItems = Boolean(primaryResult?.live);
    } else {
      items = fallbackItems(fallback, 'completed');
    }
  } else if (activeView === 'search') {
    const needle = searchKey(query);
    const catalog = parseCatalog(primaryResult?.html || '');
    const latest = enrichEpisodes(parseEpisodeFeed(searchLatestResult?.html || ''), schedule);
    const pool = [...catalog, ...latest];
    const seen = new Set();
    const matches = pool.filter((item) => {
      const key = profileKey(item.href) || item.title.toLocaleLowerCase('id-ID');
      if (!searchKey(item.title).includes(needle) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (matches.length) {
      items = matches;
      usedLiveItems = Boolean((catalog.length && primaryResult?.live) || (latest.length && searchLatestResult?.live));
    } else {
      items = fallbackItems(fallback, 'search', query);
    }
  } else if (activeView === 'schedule' || activeView === 'jadwal') {
    items = Object.values(schedule).flat();
    usedLiveItems = scheduleHasItems && Boolean(scheduleResult?.live);
  } else {
    const episodes = parseEpisodeFeed(primaryResult?.html || '');
    if (episodes.length) {
      items = enrichEpisodes(episodes, schedule);
      usedLiveItems = Boolean(primaryResult?.live);
    } else {
      items = fallbackItems(fallback, 'latest');
    }
  }

  const sourceMode = usedLiveItems ? 'live' : 'snapshot';
  return {
    ok: true,
    view: activeView,
    query: String(query || ''),
    source: SOURCE,
    sourceUrl: `${SOURCE}/`,
    sourceMode,
    updatedAt: usedLiveItems ? new Date(primaryResult?.fetchedAt || searchLatestResult?.fetchedAt || scheduleResult?.fetchedAt || Date.now()).toISOString() : fallback.generatedAt,
    items,
    total: items.length,
    schedule,
    top: topItems,
    notice: sourceMode === 'live'
      ? 'Metadata berhasil diperbarui dari sumber katalog.'
      : 'Sumber sedang membatasi permintaan; menampilkan snapshot metadata terakhir.',
  };
}

export const scraperInternals = {
  parseEpisodeFeed,
  parseCatalog,
  parseSchedule,
  parseTopTen,
  enrichEpisodes,
};
