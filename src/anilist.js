// Cadangan metadata pakai AniList ( GraphQL, tanpa API key )
// dipakai kalau Jikan/MAL sedang down.
const { request, sleep } = require('./http');
const { cache } = require('./cache');

const ENDPOINT = 'https://graphql.anilist.co';

const FIELDS = `
id
idMal
title { romaji english native }
coverImage { extraLarge large medium color }
bannerImage
description(asHtml: false)
genres
averageScore
meanScore
popularity
favourites
episodes
duration
status
format
source(version: 2)
season
seasonYear
startDate { year month day }
endDate { year month day }
trailer { id site thumbnail }
studios(isMain: true) { nodes { name } }
nextAiringEpisode { episode airingAt }
siteUrl
`;

async function gql(query, variables = {}, { ttl = 30 * 60 * 1000, key = null } = {}) {
  const ckey = key || `anilist:${JSON.stringify(variables)}:${query.length}`;
  return cache.wrap(
    ckey,
    async () => {
      let lastErr;
      for (let i = 0; i < 3; i++) {
        try {
          const res = await request(ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({ query, variables }),
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            timeout: 20000,
            retries: 0,
            curlFallback: false,
          });
          const json = JSON.parse(res.text);
          if (json.errors && !json.data) throw new Error(json.errors[0]?.message || 'AniList error');
          return json.data;
        } catch (err) {
          lastErr = err;
          await sleep(700 * (i + 1));
        }
      }
      throw lastErr;
    },
    ttl
  );
}

const stripHtml = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function normalize(m) {
  if (!m) return null;
  const title = m.title?.romaji || m.title?.english || m.title?.native || '-';
  return {
    id: `al${m.id}`,
    provider: 'anilist',
    malId: m.idMal || null,
    anilistId: m.id,
    title,
    titleEnglish: m.title?.english || '',
    titleJapanese: m.title?.native || '',
    poster: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || '',
    banner: m.bannerImage || m.coverImage?.extraLarge || '',
    color: m.coverImage?.color || '#00e5ff',
    synopsis: stripHtml(m.description || ''),
    score: m.averageScore ? m.averageScore / 10 : m.meanScore ? m.meanScore / 10 : null,
    scoredBy: m.popularity || null,
    popularity: m.popularity || null,
    favorites: m.favourites || null,
    episodes: m.episodes ?? null,
    duration: m.duration ? `${m.duration} min. per ep.` : '',
    status:
      { RELEASING: 'Currently Airing', FINISHED: 'Finished Airing', NOT_YET_RELEASED: 'Not yet aired', CANCELLED: 'Cancelled', HIATUS: 'On Hiatus' }[
        m.status
      ] || m.status,
    type: m.format || '',
    season: m.season ? `${m.season[0]}${m.season.slice(1).toLowerCase()} ${m.seasonYear ?? ''}`.trim() : '',
    year: m.seasonYear ?? m.startDate?.year ?? null,
    studios: (m.studios?.nodes || []).map((n) => n.name),
    genres: m.genres || [],
    source: m.source || '',
    trailer: m.trailer?.site === 'youtube'
      ? { embedUrl: `https://www.youtube.com/embed/${m.trailer.id}`, url: `https://youtu.be/${m.trailer.id}`, site: 'youtube' }
      : null,
    url: m.siteUrl || (m.idMal ? `https://myanimelist.net/anime/${m.idMal}` : ''),
    aired: m.startDate?.year ? { from: `${m.startDate.year}-${String(m.startDate.month || 1).padStart(2, '0')}-${String(m.startDate.day || 1).padStart(2, '0')}` } : null,
    nextAiringEpisode: m.nextAiringEpisode || null,
  };
}

async function search(q, { limit = 12 } = {}) {
  const data = await gql(
    `query($q:String,$limit:Int){Page(perPage:$limit){media(search:$q,type:ANIME,sort:SEARCH_MATCH){${FIELDS}}}}`,
    { q, limit },
    { key: `anilist:search:${q.toLowerCase()}:${limit}` }
  );
  return (data?.Page?.media || []).map(normalize);
}

async function top({ type = 'airing', limit = 12, page = 1 } = {}) {
  const sort = type === 'airing' || type === 'movie' ? 'POPULARITY_DESC' : 'SCORE_DESC';
  const status = type === 'airing' ? 'RELEASING' : null;
  const format = type === 'movie' ? 'Movie' : type === 'tv' ? 'Seri' : null;
  const args = ['type:ANIME', `sort:${sort}`];
  const vars = { page, limit };
  const decl = ['$page:Int', '$limit:Int'];
  if (status) {
    args.push('status:$status');
    vars.status = status;
    decl.push('$status:MediaStatus');
  }
  if (format) {
    args.push('format:$format');
    vars.format = format;
    decl.push('$format:MediaFormat');
  }
  const data = await gql(
    `query(${decl.join(',')}){Page(page:$page,perPage:$limit){media(${args.join(',')}){${FIELDS}}}}`,
    vars,
    { key: `anilist:top:${type}:${limit}:${page}` }
  );
  return (data?.Page?.media || []).map(normalize);
}

async function byId(id) {
  const data = await gql(
    `query($id:Int){Media(id:$id,type:ANIME){${FIELDS} relations { edges { relationType(version:2) node { id idMal title{romaji english} coverImage{large} format } } } recommendations(sort:RATING_DESC,perPage:12){nodes{rating mediaRecommendation{id idMal title{romaji english} coverImage{large} format averageScore}}}}}`,
    { id: Number(String(id).replace(/^al/, '')) },
    { key: `anilist:media:${id}` }
  );
  const n = normalize(data?.Media);
  if (!n) return null;
  n.relations = (data.Media.relations?.edges || []).map((e) => ({
    relation: e.relationType?.replace(/_/g, ' ').toLowerCase() || '',
    malId: e.node?.idMal,
    id: `al${e.node?.id}`,
    title: e.node?.title?.romaji || e.node?.title?.english || '',
    poster: e.node?.coverImage?.large || '',
    type: e.node?.format || '',
  }));
  n.recommendations = (data.Media.recommendations?.nodes || [])
    .map((r) => r.mediaRecommendation)
    .filter(Boolean)
    .map((m) => ({
      id: `al${m.id}`,
      malId: m.idMal,
      title: m.title?.romaji || m.title?.english || '',
      poster: m.coverImage?.large || '',
      type: m.format || '',
      score: m.averageScore ? m.averageScore / 10 : null,
    }));
  return n;
}

async function byMalId(malId) {
  const data = await gql(
    `query($id:Int){Media(idMal:$id,type:ANIME){${FIELDS}}}`,
    { id: Number(malId) },
    { key: `anilist:mal:${malId}` }
  );
  return normalize(data?.Media);
}

async function schedule(day /* 'monday' ... */) {
  // hari dihitung dalam WIB (UTC+7)
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 3600 * 1000);
  let idx = days.indexOf(String(day || '').toLowerCase());
  if (idx < 0) idx = wib.getUTCDay();
  const startUtc = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - 7 * 3600 * 1000;
  let diff = idx - wib.getUTCDay();
  const from = Math.floor((startUtc + diff * 86400000) / 1000);
  const to = from + 86400 - 1;
  const data = await gql(
    `query($from:Int,$to:Int){Page(page:1,perPage:40){airingSchedules(airingAt_greater:$from,airingAt_lesser:$to,sort:TIME){episode airingAt media{${FIELDS}}}}}`,
    { from, to },
    { key: `anilist:schedule:${day}:${Math.floor(Date.now() / 3600000)}`, ttl: 6 * 60 * 60 * 1000 }
  );
  return (data?.Page?.airingSchedules || []).map((s) => {
    const n = normalize(s.media);
    if (!n) return null;
    n.nextAiringEpisode = { episode: s.episode, airingAt: s.airingAt };
    return n;
  }).filter(Boolean);
}

module.exports = { id: 'anilist', search, top, byId, byMalId, schedule, normalize };
