/* Moderasi sederhana:
   1. sensor kata kasar (ID + EN) dengan toleransi varian ala "leetspeak"
   2. blokir tautan & promosi
   3. deteksi spam: huruf kapital berlebih, karakter berulang, komentar kembar
   4. batas panjang komentar
   Hasilnya: { ok, text, flags } — text sudah dibersihkan, flags untuk ditampilkan ke pengguna.
*/

// Daftar kata yang disensor (sengaja disamarkan seperlunya)
const BAD_WORDS = [
  'anjing', 'anjg', 'anjir', 'babi', 'bangsat', 'bego', 'goblok', 'gblg', 'tolol',
  'kontol', 'memek', 'ngentot', 'ngentod', 'pepek', 'perek', 'lonte', 'pelacur', 'sundal',
  'jembut', 'jancok', 'jancuk', 'asu', 'kampret', 'keparat', 'bajingan', 'brengsek', 'tai',
  'bodoh', 'mampus',
  'fuck', 'fck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'nigga', 'faggot', 'retard',
];

// angka/huruf yang sering dipakai buat nyiasatin sensor
const LEET = { '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '5': 's', '$': 's', '7': 't', '8': 'b' };

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[48@$735!10]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ');

function maskBadWords(text) {
  let hit = false;
  const out = String(text)
    .split(/(\s+)/)
    .map((w) => {
      const n = normalize(w);
      if (!n) return w;
      for (const bad of BAD_WORDS) {
        if (n === bad || n.includes(bad)) {
          hit = true;
          return w.slice(0, 1) + '*'.repeat(Math.max(2, w.length - 1));
        }
      }
      return w;
    });
  return { text: out.join(''), hit };
}

const stripCtrl = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ');

function check(text, { recent = [] } = {}) {
  const flags = [];
  let out = stripCtrl(text).trim();

  // 1. tautan & promosi
  const hadLink = /(https?:\/\/|www\.|\b(?:t\.me|bit\.ly|wa\.me|tinyurl\.com)\b)/i.test(out);
  if (hadLink) {
    out = out.replace(/(https?:\/\/\S+|www\.\S+|\b(?:t\.me|bit\.ly|wa\.me|tinyurl\.com)\/\S*)/gi, '[tautan dihapus]');
    flags.push('link');
  }
  if (/(^|\s)(?:add|follow|subscribe|sub(?:s)?|join|daftar|kunjungi)\s+(?:ig|yt|fb|tiktok|tele|dc|grup|grup\s*wa)\b/i.test(out)) {
    flags.push('promosi');
  }

  // 2. kapital berlebih
  const letters = out.replace(/[^A-Za-z]/g, '');
  if (letters.length > 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) flags.push('kapital');

  // 3. karakter berulang (anjaaaaakkk)
  if (/(.)\1{4,}/.test(out)) {
    out = out.replace(/(.)\1{3,}/g, (_m, c) => c.repeat(2));
    flags.push('berulang');
  }

  // 4. panjang
  if (out.length < 3) return { ok: false, text: out, flags: [...flags, 'pendek'], error: 'Komentar terlalu pendek' };
  if (out.length > 600) {
    out = out.slice(0, 600);
    flags.push('dipotong');
  }

  // 5. komentar kembar
  const clean = normalize(out);
  if (clean && recent.some((t) => normalize(t) === clean)) {
    return { ok: false, text: out, flags, error: 'Komentar yang sama baru saja kamu kirim' };
  }

  // 6. sensor kata kasar
  const masked = maskBadWords(out);
  if (masked.hit) {
    out = masked.text;
    flags.push('sensor');
  }

  return { ok: true, text: out.trim(), flags };
}

module.exports = { check, maskBadWords, BAD_WORDS, normalize };
