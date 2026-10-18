import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getAnimeData } from './lib/scraper.js';
import { getProxiedImage } from './lib/images.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

async function serveStatic(urlPath, res) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  let relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  let filePath = path.resolve(PUBLIC, relative);
  if (!filePath.startsWith(`${PUBLIC}${path.sep}`) && filePath !== path.join(PUBLIC, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, 'index.html');
    const body = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  } catch {
    // Client-side routes such as /ongoing and /jadwal all share the same shell.
    if (!path.extname(decoded)) {
      try {
        const body = await readFile(path.join(PUBLIC, 'index.html'));
        res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'], 'Cache-Control': 'no-cache' });
        res.end(body);
        return;
      } catch {}
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  if (requestUrl.pathname === '/api/anime') {
    try {
      const data = await getAnimeData({
        view: requestUrl.searchParams.get('view') || 'latest',
        query: requestUrl.searchParams.get('q') || '',
        refresh: requestUrl.searchParams.get('refresh') === '1',
      });
      sendJson(res, 200, data);
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || 'Scraper error' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/image') {
    const image = await getProxiedImage(requestUrl.searchParams.get('url') || '');
    res.writeHead(image.status, {
      'Content-Type': image.contentType,
      'Cache-Control': image.status === 200 ? 'public, max-age=86400' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(image.body);
    return;
  }

  await serveStatic(requestUrl.pathname, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`LUKYY Anime Index running on http://0.0.0.0:${PORT}`);
});
