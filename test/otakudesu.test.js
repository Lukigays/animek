const assert = require('node:assert/strict');
const o = require('../src/sources/otakudesu');
const p = o._parse;

const card = (title, slug, episode = 'Episode 12', day = 'Senin') =>
  `<li><div class="detpost"><a href="https://otakudesu.blog/anime/${slug}/"><img src="/poster.jpg"></a><h2 class="jdlflm">${title}</h2><div class="epz">${episode}</div><div class="epztipe">${day}</div><div class="newnime">1 hari lalu</div></div></li>`;

const home = p.parseHome(`<h1>Ongoing Anime</h1>${card('Judul A', 'judul-a')}<h1>Complete Anime</h1>${card('Judul B', 'judul-b', '12 Episode', '8.4')}`);
assert.equal(home.ongoing.length, 1);
assert.equal(home.ongoing[0].title, 'Judul A');
assert.equal(home.ongoing[0].slug, 'judul-a');
assert.equal(home.complete.length, 1);
assert.equal(home.complete[0].title, 'Judul B');

const search = p.parseSearch(`<li><img src="https://img.test/a.jpg"><h2><a href="https://otakudesu.blog/anime/a-sub-indo/">Anime &amp; Sub Indo</a></h2><div class="set"><b>Status</b> : Ongoing</div></li>`);
assert.equal(search.length, 1);
assert.equal(search[0].title, 'Anime & Sub Indo');
assert.equal(search[0].slug, 'a-sub-indo');

const detail = p.parseDetail(`<html><head><meta property="og:image" content="https://img.test/poster.jpg"><meta property="og:description" content="Sinopsis&amp; lain"></head><body><h1>Judul Anime</h1><p><span><b>Status</b> : Ongoing</span></p><a href="/genre/action/">Action</a><div class="episodelist"><a href="https://otakudesu.blog/episode/judul-episode-2/">Episode 2</a><span><span>2026-01-02</span></span><a href="https://otakudesu.blog/episode/judul-episode-1/">Episode 1</a></div></body></html>`, 'https://otakudesu.blog/anime/judul/');
assert.equal(detail.title, 'Judul Anime');
assert.equal(detail.episodes.length, 2);
assert.equal(detail.episodes[0].number, 1);
assert.equal(detail.episodes[1].number, 2);
assert.equal(detail.poster, 'https://img.test/poster.jpg');
assert.deepEqual(detail.genres, ['Action']);

const episode = p.parseEpisode(`<h1>Judul Episode</h1><iframe src="https://player.test/embed/abc"></iframe><div class="download"><ul><li><strong>480p</strong><i>200 MB</i><a href="https://files.test/video.mp4">Drive</a></li></ul></div>`, 'https://otakudesu.blog/episode/judul-episode/');
assert.equal(episode.title, 'Judul Episode');
assert.equal(episode.stream, 'https://player.test/embed/abc');
assert.equal(p.parseEpisode('<h1>Episode</h1>', 'https://otakudesu.blog/episode/a/').stream, '');
assert.equal(episode.downloads[0].quality, '480p');
assert.equal(episode.downloads[0].links[0].url, 'https://files.test/video.mp4');
assert.equal(o.cocok('https://otakudesu.blog/anime/a/'), true);
assert.equal(o.cocok('https://samehadaku.how/anime/a/'), false);
console.log('SEMUA UJI PARSER OTAKUDESU LOLOS');
