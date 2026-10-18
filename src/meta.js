// Lapisan metadata terpadu: Jikan (MyAnimeList) sebagai sumber utama,
// AniList sebagai cadangan kalau Jikan/MAL sedang bermasalah.
const jikan = require('./jikan');
const anilist = require('./anilist');
const { cache } = require('./cache');

function fromJikan(a, { compact = false } = {}) {
  if (!a) return null;
  const base = {
    id: `mal${a.mal_id}`,
    provider: 'jikan',
    malId: a.mal_id,
    title: a.title || a.title_english || '-',
    titleEnglish: a.title_english || '',
    titleJapanese: a.title_japanese || '',
    poster: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || a.images?.webp?.large_image_url || '',
    banner:
      a.images?.jpg?.large_image_url ||
      a.trailer?.images?.maximum_image_url ||
      a.images?.jpg?.image_url ||
      '',
    synopsis: a.synopsis || '',
    score: typeof a.score === 'number' ? a.score : null,
    scoredBy: a.scored_by || null,
    popularity: a.popularity || null,
    favorites: a.favorites || null,
    members: a.members || null,
    rank: a.rank || null,
    episodes: a.episodes ?? null,
    duration: a.duration || '',
    status: a.status || '',
    type: a.type || '',
    season: a.season ? `${a.season[0].toUpperCase()}${a.season.slice(1)} ${a.year || ''}`.trim() : '',
    year: a.year || a.aired?.prop?.from?.year || null,
    studios: (a.studios || []).map((s) => s.name),
    genres: (a.genres || []).map((g) => g.name).concat((a.themes || []).map((g) => g.name)),
    source: a.source || '',
    trailer: a.trailer?.embed_url
      ? { embedUrl: a.trailer.embed_url, url: a.trailer?.url || '', site: 'youtube', thumbnail: a.trailer?.images?.maximum_image_url || '' }
      : null,
    url: a.url || `https://myanimelist.net/anime/${a.mal_id}`,
    aired: a.aired?.from ? { from: a.aired.from, to: a.aired.to, string: a.aired.string } : null,
    broadcast: a.broadcast?.string || '',
  };
  if (compact) return base;
  base.relations = (a.relations || []).flatMap((r) =>
    (r.entry || []).map((e) => ({
      relation: (r.relation || '').toLowerCase(),
      malId: e.mal_id,
      id: `mal${e.mal_id}`,
      title: e.name || '',
      type: e.type || '',
      url: e.url || '',
    }))
  );
  base.recommendations = (a.recommendations || []).slice(0, 12).map((r) => ({
    id: `mal${r.entry?.mal_id}`,
    malId: r.entry?.mal_id,
    title: r.entry?.title || '',
    poster: r.entry?.images?.jpg?.large_image_url || '',
    votes: r.votes || 0,
  }));
  base.episodeList = (a.episodes_list || a.episodeList || []).slice(0, 200).map((e) => ({
    number: e.mal_id || e.episode,
    title: e.title || `Episode ${e.mal_id || e.episode}`,
    url: e.url || '',
    aired: e.aired || '',
    filler: !!e.filler,
    recap: !!e.recap,
  }));
  return base;
}

// Circuit breaker per kelompok endpoint: kalau Jikan/MAL error beberapa kali,
// langsung pakai AniList selama beberapa menit supaya halaman tidak menunggu timeout.
// Dipisah per kelompok karena endpoint Jikan bisa mati sendiri-sendiri
// (mis. /top & /search down tapi /anime/{id} jalan).
const breakers = new Map();
const JIKAN_COOLDOWN = 2 * 60 * 1000;
const getBreaker = (group) => {
  if (!breakers.has(group)) breakers.set(group, { fails: 0, until: 0 });
  return breakers.get(group);
};
const jikanAllowed = (group) => Date.now() >= getBreaker(group).until;
const noteJikanFail = (group) => {
  const b = getBreaker(group);
  b.fails += 1;
  b.until = Date.now() + (b.fails >= 2 ? JIKAN_COOLDOWN : 20 * 1000);
};
const noteJikanOk = (group) => {
  breakers.set(group, { fails: 0, until: 0 });
};

const withFallback = async (label, jikanFn, anilistFn, group = 'list') => {
  const cacheKey = `meta:${label}`;
  return cache.wrap(
    cacheKey,
    async () => {
      let jikanErr = null;
      if (jikanAllowed(group)) {
        try {
          const res = await jikanFn();
          if (res && (!Array.isArray(res) || res.length)) {
            noteJikanOk(group);
            return { ...res, _provider: 'jikan' };
          }
          throw new Error('kosong');
        } catch (err) {
          jikanErr = err;
          noteJikanFail(group);
        }
      } else {
        jikanErr = new Error('Jikan dilewati sementara (sedang gangguan)');
      }
      const res = await anilistFn();
      return { ...res, _provider: 'anilist', _jikanError: String(jikanErr?.message || '').slice(0, 140) };
    },
    20 * 60 * 1000
  );
};

async function search(q, { limit = 12 } = {}) {
  return withFallback(
    `search:${q.toLowerCase()}:${limit}`,
    async () => {
      const d = await jikan.search(q, { limit });
      return { items: (d?.data || []).map((a) => fromJikan(a, { compact: true })) };
    },
    async () => ({ items: await anilist.search(q, { limit }) }),
    'search',
    20 * 60 * 1000
  );
}

async function top({ type = 'airing', filter, limit = 12, page = 1 } = {}) {
  return withFallback(
    `top:${type}:${filter}:${limit}:${page}`,
    async () => {
      const d = await jikan.top({ type, filter, limit, page });
      return { items: (d?.data || []).map((a) => fromJikan(a, { compact: true })) };
    },
    async () => ({ items: await anilist.top({ type, limit, page }) }),
    'top',
    30 * 60 * 1000
  );
}

async function detail(id) {
  const raw = String(id);
  return withFallback(
    `detail:${raw}`,
    async () => {
      if (raw.startsWith('al')) {
        const n = await anilist.byId(raw.replace(/^al/, ''));
        if (!n) throw new Error('tidak ditemukan di AniList');
        return { item: n };
      }
      const malId = Number(raw.replace(/^mal/, ''));
      const d = await jikan.byId(malId);
      const item = fromJikan(d?.data);
      if (!item) throw new Error('tidak ditemukan di Jikan');
      // lengkapi daftar episode MAL (kalau ada)
      try {
        const eps = await jikan.episodes(malId, 1);
        const list = (eps?.data || []).map((e) => ({
          number: e.mal_id,
          title: e.title || `Episode ${e.mal_id}`,
          url: e.url || '',
          aired: e.aired || '',
          filler: !!e.filler,
          recap: !!e.recap,
          score: e.score || null,
        }));
        if (list.length) item.episodeList = list;
        if (eps?.pagination?.has_next_page && item.episodeList?.length < 100) {
          const eps2 = await jikan.episodes(malId, 2);
          const list2 = (eps2?.data || []).map((e) => ({
            number: e.mal_id,
            title: e.title || `Episode ${e.mal_id}`,
            url: e.url || '',
            aired: e.aired || '',
            filler: !!e.filler,
            recap: !!e.recap,
            score: e.score || null,
          }));
          item.episodeList = [...(item.episodeList || []), ...list2];
        }
      } catch {
        /* daftar episode opsional */
      }
      return { item };
    },
    async () => {
      const item = raw.startsWith('al')
        ? await anilist.byId(raw.replace(/^al/, ''))
        : await anilist.byMalId(raw.replace(/^mal/, ''));
      if (!item) throw new Error('Anime tidak ditemukan');
      return { item: { ...item, episodeList: [], relations: [], recommendations: [] } };
    },
    'detail',
    6 * 60 * 60 * 1000
  );
}

async function schedule(day) {
  return withFallback(
    `schedule:${day || 'today'}`,
    async () => {
      const d = await jikan.schedule(day);
      return { items: (d?.data || []).map((a) => fromJikan(a, { compact: true })) };
    },
    async () => ({ items: await anilist.schedule(day) }),
    'schedule',
    60 * 60 * 1000
  );
}

async function genres() {
  return withFallback(
    'genres',
    async () => {
      const d = await jikan.genres();
      return {
        items: (d?.data || []).map((g) => ({
          id: g.mal_id,
          name: g.name,
          count: g.count,
          slug: String(g.name).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        })),
      };
    },
    async () => ({
      items: [
        'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo',
        'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life',
        'Sports', 'Supernatural', 'Thriller',
      ].map((name, i) => ({ id: i + 1, name, count: null, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') })),
    }),
    'genres',
    24 * 60 * 60 * 1000
  );
}

async function byGenre(id, page = 1) {
  return withFallback(
    `genre:${id}:${page}`,
    async () => {
      const d = await jikan.byGenre(id, page);
      return { items: (d?.data || []).map((a) => fromJikan(a, { compact: true })) };
    },
    async () => ({ items: [] }),
    'genre',
    30 * 60 * 1000
  );
}

// Cari metadata yang paling cocok untuk judul dari sumber streaming
const norm = (s = '') =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(sub|indo|subtitle|indonesia|season|s\d+|episode|batch|bd|tv|ova|ona|movie)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function matchTitle(title) {
  if (!title) return null;
  try {
    const res = await search(title, { limit: 8 });
    const list = res.items || [];
    if (!list.length) return null;
    const target = norm(title);
    let best = null;
    let bestScore = -1;
    for (const item of list) {
      const candidates = [item.title, item.titleEnglish, item.titleJapanese].filter(Boolean).map(norm);
      let score = 0;
      for (const c of candidates) {
        if (!c) continue;
        if (c === target) score = Math.max(score, 100);
        else if (c.startsWith(target) || target.startsWith(c)) score = Math.max(score, 80);
        else if (c.includes(target) || target.includes(c)) score = Math.max(score, 55);
        else {
          const a = new Set(target.split(' '));
          const b = new Set(c.split(' '));
          const inter = [...a].filter((x) => b.has(x)).length;
          score = Math.max(score, (inter / Math.max(a.size, b.size)) * 45);
        }
      }
      if (item.popularity) score += Math.min(5, item.popularity / 400);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return bestScore >= 25 ? best : null;
  } catch {
    return null;
  }
}

module.exports = { search, top, detail, schedule, genres, byGenre, matchTitle, fromJikan };
