const IMAGE_CACHE_TTL = 60 * 60 * 1000;
const imageCache = new Map();

function allowedImageHost(url) {
  if (url.hostname === 'v2.samehadaku.how') {
    return url.pathname.startsWith('/wp-content/uploads/');
  }
  return /^i[0-3]\.wp\.com$/.test(url.hostname) && /samehadaku/i.test(url.pathname);
}

export async function getProxiedImage(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { status: 400, contentType: 'text/plain; charset=utf-8', body: Buffer.from('Invalid image URL') };
  }

  if (url.protocol !== 'https:' || !allowedImageHost(url)) {
    return { status: 403, contentType: 'text/plain; charset=utf-8', body: Buffer.from('Image host is not allowed') };
  }

  const key = url.href;
  const cached = imageCache.get(key);
  if (cached && Date.now() - cached.createdAt < IMAGE_CACHE_TTL) {
    return { status: 200, ...cached, cached: true };
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Referer: 'https://v2.samehadaku.how/',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`Image source returned ${response.status}`);
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== 'https:' || !allowedImageHost(finalUrl)) {
      throw new Error('Image redirect is outside the allowlist');
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    if (!contentType.toLowerCase().startsWith('image/')) throw new Error('Source did not return an image');
    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > 8_000_000) throw new Error('Image is too large');
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > 8_000_000) throw new Error('Image is too large');

    const value = { body, contentType, createdAt: Date.now() };
    imageCache.set(key, value);
    if (imageCache.size > 160) imageCache.delete(imageCache.keys().next().value);
    return { status: 200, ...value, cached: false };
  } catch (error) {
    return { status: 502, contentType: 'text/plain; charset=utf-8', body: Buffer.from(`Could not load source image: ${error.message}`) };
  }
}
