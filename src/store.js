/* Lapisan penyimpanan:
   - kalau MONGODB_URI diisi → pakai MongoDB (komentar, user, clan, like, view, moderasi)
   - kalau tidak → pakai memori + berkas data/store.json (tetap jalan tanpa database)
   Semua fungsi aman dipanggil meski Mongo sedang tidak tersedia: otomatis fallback.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'store.json');

const memory = {
  kv: {}, // key bebas -> nilai
  comments: {}, // key -> [komentar]
  likes: {}, // key -> angka
  views: {}, // key -> angka
  users: {}, // sub (id google) -> user
  tokens: {}, // token sesi -> sub
  clans: {}, // tag -> clan
  moderation: [], // log moderasi
};

/* ------------------------------- backend file ------------------------------ */
let saveTimer = null;
function saveFile() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(memory));
    } catch {
      /* serverless: filesystem read-only */
    }
  }, 1500);
}
function loadFile() {
  try {
    if (fs.existsSync(FILE)) Object.assign(memory, JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch {
    /* abaikan */
  }
}

/* -------------------------------- backend mongo ---------------------------- */
let mongo = null; // { client, db }
const col = (name) => (mongo ? mongo.db.collection(name) : null);

async function initMongo() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'kelasnime';
  if (!uri) return null;
  let client;
  try {
    const { MongoClient } = require('mongodb');
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    mongo = { client, db: client.db(dbName) };
    // index supaya query cepat
    await Promise.allSettled([
      col('comments').createIndex({ key: 1, at: -1 }),
      col('comments').createIndex({ id: 1 }),
      col('users').createIndex({ sub: 1 }, { unique: true }),
      col('clans').createIndex({ tag: 1 }, { unique: true }),
      col('counters').createIndex({ key: 1 }, { unique: true }),
    ]);
    console.log('[store] MongoDB terhubung:', dbName);
    return mongo;
  } catch (err) {
    console.error('[store] MongoDB gagal, fallback ke berkas:', err.message);
    try {
      await client?.close();
    } catch {
      /* abaikan */
    }
    mongo = null;
    return null;
  }
}

let readyPromise = null;
function ready() {
  if (!readyPromise) readyPromise = (async () => { loadFile(); await initMongo(); })();
  return readyPromise;
}
const backend = () => (mongo ? 'mongodb' : 'file');

/* ------------------------------- pembantu angka ---------------------------- */
async function bump(keyName, key, n = 1) {
  await ready();
  if (mongo) {
    const r = await col('counters').findOneAndUpdate(
      { key: keyName + ':' + key },
      { $inc: { value: n } },
      { upsert: true, returnDocument: 'after', includeResultMetadata: true }
    );
    return r?.value?.value ?? n;
  }
  memory[keyName][key] = (memory[keyName][key] || 0) + n;
  saveFile();
  return memory[keyName][key];
}
const counter = (keyName, key) => {
  // baca tanpa menambah
  const run = async () => {
    await ready();
    if (mongo) {
      const d = await col('counters').findOne({ key: keyName + ':' + key });
      return d?.value || 0;
    }
    return memory[keyName][key] || 0;
  };
  return run();
};

/* ------------------------- penyimpanan nilai bebas ------------------------- */
// dipakai untuk daftar subscribe pengguna dan cadangan data sumber
async function getKV(keyName, key, fallback = null) {
  await ready();
  if (mongo) {
    const d = await col('kv').findOne({ key: keyName + ':' + key });
    return d ? d.value : fallback;
  }
  memory.kv = memory.kv || {};
  const v = memory.kv[keyName + ':' + key];
  return v === undefined ? fallback : v;
}

async function setKV(keyName, key, value) {
  await ready();
  if (mongo) {
    await col('kv').updateOne({ key: keyName + ':' + key }, { $set: { value } }, { upsert: true });
    return value;
  }
  memory.kv = memory.kv || {};
  memory.kv[keyName + ':' + key] = value;
  saveFile();
  return value;
}

/* --------------------------------- komentar -------------------------------- */
async function listComments(key) {
  await ready();
  if (mongo) return col('comments').find({ key }).sort({ at: 1 }).limit(500).toArray();
  return memory.comments[key] || [];
}

async function addComment(key, item) {
  await ready();
  if (mongo) {
    await col('comments').insertOne({ ...item, key });
    return item;
  }
  const list = memory.comments[key] || (memory.comments[key] = []);
  list.push(item);
  memory.comments[key] = list.slice(-300);
  saveFile();
  return item;
}

async function findComment(id) {
  await ready();
  if (mongo) return col('comments').findOne({ id });
  for (const list of Object.values(memory.comments)) {
    const hit = list.find((c) => c.id === id);
    if (hit) return hit;
  }
  return null;
}

async function updateComment(id, patch) {
  await ready();
  if (mongo) {
    await col('comments').updateOne({ id }, { $set: patch });
    if (patch.hidden) await col('comments').updateMany({ parentId: id }, { $set: { hidden: true } });
    return;
  }
  for (const list of Object.values(memory.comments)) {
    const hit = list.find((c) => c.id === id);
    if (hit) Object.assign(hit, patch);
    if (patch.hidden) for (const c of list) if (c.parentId === id) c.hidden = true;
  }
  saveFile();
}

const likeComment = (id) => updateComment(id, { $inc: 1 }).catch(() => {});

async function likeCommentById(id) {
  await ready();
  if (mongo) {
    await col('comments').updateOne({ id }, { $inc: { likes: 1 } });
    const d = await col('comments').findOne({ id });
    return d?.likes || 0;
  }
  for (const list of Object.values(memory.comments)) {
    const hit = list.find((c) => c.id === id);
    if (hit) {
      hit.likes = (hit.likes || 0) + 1;
      saveFile();
      return hit.likes;
    }
  }
  return 0;
}

async function reportComment(id) {
  await ready();
  const item = await findComment(id);
  if (!item) return null;
  const reports = (item.reports || 0) + 1;
  const hidden = reports >= 3;
  await updateComment(id, { reports, hidden });
  await logModeration({ type: 'report', id, reports, hidden, at: Date.now() });
  return { reports, hidden };
}

/* ---------------------------------- moderasi -------------------------------- */
async function logModeration(entry) {
  await ready();
  if (mongo) {
    await col('moderation').insertOne(entry);
    return;
  }
  memory.moderation.unshift(entry);
  memory.moderation = memory.moderation.slice(0, 500);
  saveFile();
}

/* ----------------------------------- user ---------------------------------- */
async function getUser(sub) {
  await ready();
  if (mongo) return col('users').findOne({ sub });
  return memory.users[sub] || null;
}

async function upsertUser(user) {
  await ready();
  const now = Date.now();
  const base = {
    sub: user.sub,
    name: user.name,
    picture: user.picture || '',
    email: user.email || '',
    exp: user.exp || 0,
    clan: user.clan || '',
    updatedAt: now,
  };
  if (mongo) {
    const cur = await col('users').findOne({ sub: user.sub });
    await col('users').updateOne(
      { sub: user.sub },
      { $set: { ...base, exp: Math.max(base.exp, cur?.exp || 0) }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    return col('users').findOne({ sub: user.sub });
  }
  const cur = memory.users[user.sub];
  memory.users[user.sub] = { ...base, exp: Math.max(base.exp, cur?.exp || 0), createdAt: cur?.createdAt || now };
  saveFile();
  return memory.users[user.sub];
}

async function setSession(token, sub) {
  await ready();
  const rec = { token, sub, at: Date.now() };
  if (mongo) {
    await col('users').updateOne({ sub }, { $set: { token, tokenAt: Date.now() } });
    return;
  }
  memory.tokens[token] = rec;
  saveFile();
}

async function userByToken(token) {
  if (!token) return null;
  await ready();
  if (mongo) return col('users').findOne({ token });
  const rec = memory.tokens[token];
  return rec ? memory.users[rec.sub] || null : null;
}

async function addExp(sub, amount, name) {
  await ready();
  if (mongo) {
    const r = await col('users').findOneAndUpdate(
      { sub },
      { $inc: { exp: amount }, $set: { updatedAt: Date.now(), ...(name ? { name } : {}) } },
      { returnDocument: 'after', includeResultMetadata: true }
    );
    return r?.value || null;
  }
  const u = memory.users[sub];
  if (!u) return null;
  u.exp = (u.exp || 0) + amount;
  if (name) u.name = name;
  u.updatedAt = Date.now();
  saveFile();
  return u;
}

/* --------------------------- check-in harian (streak) ---------------------- */
const dayKey = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);

async function checkIn(sub) {
  await ready();
  let u = mongo ? await col('users').findOne({ sub }) : memory.users[sub];
  if (!u) return { ok: false, error: 'Pengguna tidak ditemukan' };
  const today = dayKey();
  const yesterday = dayKey(Date.now() - 86400000);
  if (u.lastDay === today) {
    return { ok: false, sudah: true, streak: u.streak || 1, reward: 0, user: u };
  }
  const streak = u.lastDay === yesterday ? Math.min(365, (u.streak || 0) + 1) : 1;
  const reward = require('./level').checkInReward(streak);
  const patch = { streak, lastDay: today, exp: (u.exp || 0) + reward, updatedAt: Date.now() };
  if (mongo) {
    u = await col('users').findOneAndUpdate({ sub }, { $set: patch }, { returnDocument: 'after', includeResultMetadata: true }).then((r) => r?.value || u);
  } else {
    Object.assign(u, patch);
    saveFile();
  }
  return { ok: true, streak, reward, user: u };
}

/* total tayang semua episode satu judul */
async function sumViews(slug) {
  await ready();
  const prefix = 'views:view:' + slug + ':';
  if (mongo) {
    const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = '^views:view:' + esc(slug) + ':';
    const rows = await col('counters').find({ key: { $regex: rx } }).toArray();
    return rows.reduce((a, r) => a + (r.value || 0), 0);
  }
  return Object.entries(memory.views || {})
    .filter(([k]) => k.startsWith(prefix))
    .reduce((a, [, v]) => a + (v || 0), 0);
}

/* ambil banyak user sekaligus (untuk lencana level di komentar) */
async function usersBySubs(subs = []) {
  await ready();
  const list = [...new Set(subs.filter(Boolean))].slice(0, 200);
  if (!list.length) return {};
  if (mongo) {
    const rows = await col('users').find({ sub: { $in: list } }).toArray();
    return Object.fromEntries(rows.map((u) => [u.sub, u]));
  }
  const out = {};
  for (const s of list) if (memory.users[s]) out[s] = memory.users[s];
  return out;
}

/* ----------------------------------- clan ---------------------------------- */
async function listClans() {
  await ready();
  if (mongo) return col('clans').find({}).sort({ exp: -1 }).limit(100).toArray();
  return Object.values(memory.clans).sort((a, b) => (b.exp || 0) - (a.exp || 0));
}

async function getClan(tag) {
  await ready();
  const t = String(tag || '').toUpperCase();
  if (mongo) return col('clans').findOne({ tag: t });
  return memory.clans[t] || null;
}

async function createClan(clan) {
  await ready();
  const tag = String(clan.tag || '').toUpperCase();
  const rec = {
    tag,
    name: clan.name,
    owner: clan.owner,
    members: [clan.owner],
    exp: 0,
    createdAt: Date.now(),
  };
  if (mongo) {
    await col('clans').insertOne(rec);
    return rec;
  }
  memory.clans[tag] = rec;
  saveFile();
  return rec;
}

async function updateClan(tag, patch) {
  await ready();
  const t = String(tag || '').toUpperCase();
  if (mongo) {
    await col('clans').updateOne({ tag: t }, { $set: patch });
    return col('clans').findOne({ tag: t });
  }
  Object.assign(memory.clans[t] || {}, patch);
  saveFile();
  return memory.clans[t];
}

async function setUserClan(sub, tag) {
  await ready();
  if (mongo) {
    await col('users').updateOne({ sub }, { $set: { clan: tag || '' } });
    return;
  }
  if (memory.users[sub]) memory.users[sub].clan = tag || '';
  saveFile();
}

async function topUsers(limit = 10) {
  await ready();
  if (mongo) return col('users').find({}).sort({ exp: -1 }).limit(limit).toArray();
  return Object.values(memory.users)
    .sort((a, b) => (b.exp || 0) - (a.exp || 0))
    .slice(0, limit);
}

/* --------------------------------- ekspor ---------------------------------- */
module.exports = {
  ready,
  backend,
  listComments,
  addComment,
  findComment,
  updateComment,
  likeComment: likeCommentById,
  reportComment,
  logModeration,
  getUser,
  upsertUser,
  setSession,
  userByToken,
  addExp,
  checkIn,
  usersBySubs,
  sumViews,
  listClans,
  getClan,
  createClan,
  updateClan,
  setUserClan,
  topUsers,
  bumpLikes: (key) => bump('likes', key, 1),
  getLikes: (key) => counter('likes', key),
  bumpViews: (key) => bump('views', key, 1),
  getViews: (key) => counter('views', key),
  newId: () => crypto.randomBytes(6).toString('hex'),
  getKV,
  setKV,
};
