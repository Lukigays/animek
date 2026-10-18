import { getProxiedImage } from '../lib/images.js';

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end('Method not allowed');
  }

  const rawUrl = req.query?.url || '';
  const image = await getProxiedImage(String(rawUrl));
  res.statusCode = image.status;
  res.setHeader('Content-Type', image.contentType);
  if (image.status === 200) {
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
  return res.end(image.body);
}
