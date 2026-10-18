/* Level & EXP ala Wibuku: header menampilkan "Lvl. X" dan bar "792/1.500" */

const needFor = (lvl) => 50 * Math.pow(Math.max(1, lvl) - 1, 2); // L1=0, L2=50, L3=200, L4=450, L5=800, L6=1250…

function fromExp(exp = 0) {
  let level = 1;
  while (needFor(level + 1) <= exp && level < 999) level++;
  const start = needFor(level);
  const next = needFor(level + 1);
  const need = Math.max(1, next - start);
  return {
    level,
    exp,
    start,
    next,
    current: exp - start,
    need,
    percent: Math.min(100, Math.round(((exp - start) / need) * 100)),
  };
}

/* gelar per level — makin tinggi makin bergengsi */
const TITLES = [
  [1, 'Pemula'],
  [3, 'Otak-otak'],
  [5, 'Wibu Pemula'],
  [8, 'Ksatria Nime'],
  [12, 'Veteran'],
  [17, 'Dewa Nime'],
  [25, 'Legenda'],
  [40, 'Kaisar Nime'],
];

function titleFor(level = 1) {
  let t = 'Pemula';
  for (const [min, name] of TITLES) if (level >= min) t = name;
  return t;
}

/* bingkai avatar: 0 biasa → 6 legendaris */
function frameFor(level = 1) {
  if (level >= 25) return 6;
  if (level >= 17) return 5;
  if (level >= 12) return 4;
  if (level >= 8) return 3;
  if (level >= 5) return 2;
  if (level >= 3) return 1;
  return 0;
}

const FRAME_NAME = ['Biasa', 'Perunggu', 'Perak', 'Emas', 'Platinum', 'Epik', 'Legendaris'];

/* bonus check-in harian: hari ke-1 = 25 EXP, naik 5 tiap hari sampai maks 60 */
const checkInReward = (streak = 1) => Math.min(60, 20 + 5 * Math.min(streak, 8));

const REWARD = {
  watch: 15, // selesai menonton 1 episode
  comment: 8, // kirim komentar
  reply: 5, // balas komentar
  like: 2, // menyukai sebuah judul
  daily: 25, // bonus login harian
  clan: 30, // membuat clan
  share: 5, // membagikan tautan
};

module.exports = { fromExp, needFor, REWARD, titleFor, frameFor, FRAME_NAME, checkInReward };
