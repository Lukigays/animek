// Utilitas HTTP: fetch dengan User-Agent browser, timeout, retry,
// deteksi halaman anti-bot, dan fallback ke curl (fingerprint TLS Node sering
// diblokir Cloudflare pada halaman tertentu).
const { execFile } = require('child_process');

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
];
const UA = UA_POOL[0];
const pickUA = () => UA_POOL[Math.floor(Math.random() * UA_POOL.length)];

const BROWSER_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Upgrade-Insecure-Requests': '1',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// throttle sederhana per host supaya tidak kena rate limit
const lastHit = new Map();
// jeda antar request ke host yang sama, ditambah acakan supaya polanya tidak kelihatan seperti bot
async function throttle(url, minGap = 140) {
  try {
    const host = new URL(url).host;
    const now = Date.now();
    const gap = minGap + Math.floor(Math.random() * 260);
    const wait = Math.max(0, gap - (now - (lastHit.get(host) || 0)));
    lastHit.set(host, now + wait);
    if (wait) await sleep(wait);
  } catch {
    /* abaikan */
  }
}

function curlFetch(url, { timeout = 25000, headers = {}, method = 'GET', body = null } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-sS',
      '-L',
      '--compressed',
      '--max-time',
      String(Math.ceil(timeout / 1000)),
      '-A',
      headers['User-Agent'] || pickUA(),
      '-w',
      '\n__KELASNIME__%{http_code}\t%{url_effective}',
    ];
    Object.entries(headers).forEach(([k, v]) => {
      if (k.toLowerCase() === 'user-agent') return;
      args.push('-H', `${k}: ${v}`);
    });
    if (method === 'POST') {
      args.push('-X', 'POST', '--data', body || '');
    }
    args.push(url);
    execFile('curl', args, { maxBuffer: 40 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return reject(err);
      const m = stdout.match(/\n__KELASNIME__(\d+)\t(.*)$/);
      const text = m ? stdout.slice(0, m.index) : stdout;
      const status = m ? Number(m[1]) : 0;
      resolve({
        ok: status >= 200 && status < 400,
        status,
        url: m ? m[2].trim() : url,
        text: text || '',
        headers: new Map(),
      });
    });
  });
}

async function nodeFetch(url, { timeout = 25000, headers = {}, method = 'GET', body, ...rest }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      body,
      headers: { ...BROWSER_HEADERS, 'User-Agent': pickUA(), ...headers },
      redirect: 'follow',
      signal: ctrl.signal,
      ...rest,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, headers: res.headers, text };
  } finally {
    clearTimeout(timer);
  }
}

async function request(url, opts = {}) {
  const { timeout = 25000, headers = {}, method = 'GET', body, retries = 1, curlFallback = true, ...rest } = opts;
  await throttle(url);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await nodeFetch(url, { timeout, headers, method, body, ...rest });
      if (curlFallback && looksBlocked(res.text)) {
        const viaCurl = await curlFetch(url, { timeout, headers, method, body });
        if (!looksBlocked(viaCurl.text)) return viaCurl;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(500 * (attempt + 1));
    }
  }
  if (curlFallback) {
    try {
      return await curlFetch(url, { timeout, headers, method, body });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Gagal mengambil data');
}

const get = (url, opts = {}) => request(url, { ...opts, method: 'GET' });

function postForm(url, form, opts = {}) {
  const body = new URLSearchParams(form).toString();
  return request(url, {
    ...opts,
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      ...(opts.headers || {}),
    },
  });
}

// Halaman challenge / anti-bot yang bukan konten asli
function looksBlocked(html = '') {
  if (!html) return true;
  if (/Just a moment\.\.\.|cf-browser-verification|challenges\.cloudflare\.com|Attention Required/i.test(html)) {
    return true;
  }
  if (html.length < 3000 && /window\.location\.replace|Loading\.\.\.|enable JavaScript/i.test(html)) return true;
  return false;
}

async function fetchHtml(url, opts = {}) {
  const res = await get(url, opts);
  if (looksBlocked(res.text)) {
    const err = new Error('BLOCKED');
    err.status = res.status;
    throw err;
  }
  return res.text;
}

module.exports = { UA, UA_POOL, pickUA, BROWSER_HEADERS, request, get, postForm, fetchHtml, looksBlocked, curlFetch, sleep };
