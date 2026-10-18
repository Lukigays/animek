// Sumber uji LOKAL — hanya dimuat kalau UJI_LOKAL=1.
// Tujuannya menguji pemutar sendiri (pemutar kami + lanjut dari menit terakhir)
// tanpa bergantung pada host video luar yang bisa mati/rate-limit.
// Slug "uji" & nomor bebas, dua server supaya tombol ganti server tetap teruji.
const JML_EP = 5;

const sama = (num) => ({
  number: num,
  title: 'Episode ' + num,
  url: `uji://episode/${num}`,
});

module.exports = {
  id: 'uji',
  cocok: (url) => String(url).startsWith('uji://'),
  async detail(slug) {
    if (slug !== 'uji') return null;
    return {
      slug: 'uji',
      title: 'Uji Pemutar Lokal',
      synopsis: 'Video percobaan untuk menguji pemutar dan lanjut dari menit terakhir.',
      poster: '',
      episodes: Array.from({ length: JML_EP }, (_, i) => sama(i + 1)),
      genres: ['Uji'],
      status: 'Ongoing',
      score: 0,
    };
  },
  async servers(url) {
    const m = String(url).match(/episode\/(\d+)/);
    const num = m ? Number(m[1]) : 1;
    const base = process.env.UJI_BASE || 'http://127.0.0.1:3000';
    return {
      title: 'Uji Episode ' + num,
      servers: [
        { type: 'mp4', label: 'Server 1 · 360p', url: base + '/media/uji.mp4', alive: true },
        { type: 'mp4', label: 'Server 2 · 360p', url: base + '/media/uji.mp4', alive: true },
      ],
    };
  },
};
