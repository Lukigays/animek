// Scraper Kusonime — sumber TAMBAHAN khusus link UNDUHAN anime (bukan pemutar).
// Sumber streaming utama (Samehadaku / Oploverz) cuma punya link embed, jadi
// fitur unduh mengambil berkas dari sini (Google Drive, Pixeldrain, Acefile,
// Terabox, Mega, dan lain-lain) lengkap dengan pilihan kualitas 360P - 1080P.
const { load } = require('cheerio');
const { fetchHtml } = require('../http');
const { cache } = require('../cache');

const BASE = (process.env.KUSONIME_BASE || 'https://kusonime.com').replace(/\/$/, '');

function txt(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function slugFromUrl(url = '') {
  const m = String(url).replace(/\/$/, '').match(/\/([^/]+)$/);
  return m ? m[1] : '';
}

async function ksGet(path, ttl = 60 * 60 * 1000) {
  return cache.wrap(`kusu:${path}`, () => fetchHtml(`${BASE}${path}`), ttl);
}

/* --------------------------------- CARI ---------------------------------- */
async function search(q) {
  const html = await ksGet(`/?s=${encodeURIComponent(q)}&post_type=anime`, 60 * 60 * 1000);
  const $ = load(html);
  const items = [];
  const seen = new Set();

  $('.venz .detpost, .venz ul .kover .detpost').each((_, el) => {
    const $el = $(el);
    const a = $el.find('a[href*="' + BASE + '/"]').first();
    const url = a.attr('href');
    if (!url || url.includes('/genre') || url.includes('/seasons')) return;
    const title = txt(a.attr('title') || a.text());
    if (!title || seen.has(url)) return;
    seen.add(url);
    const poster = $el.find('img').attr('src') || '';
    items.push({
      title: title.replace(/\s*Subtitle Indonesia\s*$/i, '').replace(/\s*Sub Indo\s*$/i, '').trim(),
      url,
      slug: slugFromUrl(url),
      poster,
      status: /batch/i.test(title) ? 'Tamat' : 'Ongoing',
      source: 'kusonime',
    });
  });
  return items.slice(0, 12);
}

/* -------------------------------- DETAIL --------------------------------- */
async function detail(slug) {
  const html = await ksGet(`/${slug}/`, 60 * 60 * 1000);
  const $ = load(html);

  const title = txt($('h1.entry-title, .venser .post h1, title').first().text()).replace(/\s*\|\s*Kusonime\s*$/i, '');
  const poster = $('meta[property="og:image"]').attr('content') || $('.venser img').first().attr('src') || '';

  // info: Japanese, Episode, Durasi, Studio, Genre, Release, Status
  const info = {};
  $('.venser .info, .infozingle').each((_, el) => {
    const body = $(el).html() || '';
    body.split(/<br\s*\/?>/i).forEach((row) => {
      const $r = load(row);
      const key = txt($r('b, strong').first().text()).replace(/:$/, '');
      const val = txt($r.root().text().replace(/^[^:]*:/, ''));
      if (key && val) info[key] = val;
    });
  });

  const genres = [];
  $('a[href*="/genres/"]').each((_, el) => {
    const g = txt($(el).text());
    if (g && !genres.includes(g)) genres.push(g);
  });

  const synopsis = txt($('.venser .post p').map((_, el) => $(el).text()).get().slice(0, 6).join(' ')).slice(0, 1200);

  // ---- daftar unduhan: tiap blok = satu kualitas, isinya banyak host ----
  const groups = [];
  $('.smokeurlrh, .smokeurl, .dlbox .smokeurlrh').each((_, el) => {
    const $b = $(el);
    const quality = txt($b.find('strong').first().text()) || 'Unduhan';
    const links = [];
    $b.find('a[href^="http"]').each((_, a) => {
      const $a = $(a);
      const href = $a.attr('href');
      const host = txt($a.text()) || hostOf(href);
      if (!href || /advertis|iklan|adblock/i.test(host)) return;
      links.push({ host, url: href, direct: isDirect(href) });
    });
    if (links.length) groups.push({ quality, links });
  });

  // episode (kalau postingannya berisi daftar episode, bukan batch)
  const episodes = [];
  $('a[href*="' + BASE + '/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const label = txt($(el).text());
    const m = label.match(/Episode\s*(\d+)/i) || href.match(/episode-?(\d+)/i);
    if (!m) return;
    episodes.push({ number: Number(m[1]), title: label || `Episode ${m[1]}`, url: href, slug: slugFromUrl(href) });
  });
  const uniq = [];
  const seen = new Set();
  episodes.sort((a, b) => a.number - b.number).forEach((e) => {
    if (!seen.has(e.number)) { seen.add(e.number); uniq.push(e); }
  });

  return {
    source: 'kusonime',
    slug,
    url: `${BASE}/${slug}/`,
    title: title.replace(/\s*Batch Subtitle Indonesia\s*$/i, '').trim(),
    poster,
    synopsis,
    genres,
    info,
    status: info.Status || (/\bbatch\b/i.test(title) ? 'Tamat' : 'Ongoing'),
    downloads: groups,
    episodes: uniq,
  };
}

function hostOf(url = '') {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
}

// host yang bisa diunduh langsung lewat proxy kita
function isDirect(url = '') {
  return /drive\.usercontent\.google\.com|docs\.google\.com\/uc|pixeldrain\.com\/api|cdn\.|mediafire\.com\/\w{11}\/|\.mp4($|\?)/i.test(url);
}

module.exports = { id: 'kusonime', label: 'Sumber unduhan', base: async () => BASE, search, detail };
