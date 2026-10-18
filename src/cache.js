// Cache sederhana di memori dengan TTL + de-duplikasi request yang sedang berjalan.
class TTLCache {
  constructor(defaultTTL = 10 * 60 * 1000, max = 800) {
    this.defaultTTL = defaultTTL;
    this.max = max;
    this.store = new Map();
    this.inflight = new Map();
  }

  get(key) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expire) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key, value, ttl = this.defaultTTL) {
    if (this.store.size >= this.max) {
      // buang entri paling tua
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
    this.store.set(key, { value, expire: Date.now() + ttl });
    return value;
  }

  // Jalankan fn() sekali untuk banyak pemanggil bersamaan (mencegah spam upstream)
  async wrap(key, fn, ttl = this.defaultTTL) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = (async () => {
      try {
        const value = await fn();
        if (value !== undefined && value !== null) this.set(key, value, ttl);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  clear() {
    this.store.clear();
  }
}

module.exports = { TTLCache, cache: new TTLCache() };
