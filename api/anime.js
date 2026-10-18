import { getAnimeData } from '../lib/scraper.js';

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const query = req.query || {};
    const data = await getAnimeData({
      view: query.view || 'latest',
      query: query.q || '',
      refresh: query.refresh === '1' || query.refresh === 'true',
    });
    res.setHeader('Cache-Control', 'public, s-maxage=240, stale-while-revalidate=720');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Scraper error' });
  }
}
