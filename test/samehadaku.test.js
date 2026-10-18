const assert = require('node:assert/strict');
const sh = require('../src/sources/samehadaku');
const p = sh._parse;

const latestHtml = `<div class="latestepisode_widget"><ul><li>
<div class="thumb"><a href="https://v2.samehadaku.how/one-piece-episode-1180/"><img src="https://img.test/ep.jpg"></a></div>
<div class="dtla"><h2 class="entry-title"><a href="https://v2.samehadaku.how/anime/one-piece/" title="One Piece">One Piece</a></h2><span>Episode 1180</span><span>Released on: 2 Jam lalu</span></div>
</li></ul></div>`;
const latest = p.parseLatest(latestHtml);
assert.equal(latest.length, 1);
assert.equal(latest[0].title, 'One Piece');
assert.equal(latest[0].slug, 'one-piece');
assert.equal(latest[0].episode, 1180);
assert.equal(latest[0].poster, 'https://img.test/ep.jpg');

const cards = p.parseSearch(`<div class="animposx"><article class="animepost"><a href="https://v2.samehadaku.how/anime/overgeared/" title="Overgeared"><div class="content-thumb"><img src="https://img.test/poster.jpg"><div class="score">★ 7.33</div></div><div class="data"><div class="title"><h2>Overgeared</h2></div><div class="type">Ongoing</div></div></a></article></div>`);
assert.equal(cards.length, 1);
assert.equal(cards[0].title, 'Overgeared');
assert.equal(cards[0].slug, 'overgeared');
assert.equal(cards[0].status, 'Ongoing');
assert.equal(cards[0].score, '7.33');

const detail = p.parseDetail(`<html><head><meta property="og:image" content="https://img.test/overgeared.jpg"></head><body><main><h1>Overgeared Sub Indo</h1><div class="entry-content-single"><p>Sinopsis:</p><p>Seorang pandai besi berpetualang.</p></div><div class="card"><h3>Detail Anime Overgeared</h3><div class="grid"><div><span>Status</span><span>Ongoing</span></div><div><span>Type</span><span>TV</span></div></div></div><div class="card"><h3>List Episode Overgeared Subtitle Indonesia</h3><ul><li><a href="https://v2.samehadaku.how/overgeared-episode-2/">Overgeared Episode 2</a></li><li><a href="https://v2.samehadaku.how/overgeared-episode-1/">Overgeared Episode 1</a></li></ul></div></main></body></html>`, 'https://v2.samehadaku.how/anime/overgeared/');
assert.equal(detail.title, 'Overgeared');
assert.equal(detail.episodes.length, 2);
assert.equal(detail.episodes[0].number, 1);
assert.equal(detail.episodes[1].number, 2);
assert.equal(detail.status, 'Ongoing');
assert.equal(detail.synopsis, 'Seorang pandai besi berpetualang.');

const servers = p.parseServers(`<div class="player-server-btn" data-embed="&lt;iframe src=&quot;https://mega.nz/embed/abc&quot;&gt;&lt;/iframe&gt;"><span>Mega 480p</span></div><div class="player-server-btn disabled"><span>Gofile</span></div><div class="download-eps"><p><b>MP4</b></p><ul><li><strong>720p</strong><div class="download-eps-links"><a href="https://files.test/720p.mp4">Drive</a></div></li></ul></div><h1 class="entry-title">Overgeared Episode 2</h1>`, 'https://v2.samehadaku.how/overgeared-episode-2/');
assert.equal(servers.servers.length, 1);
assert.equal(servers.servers[0].url, 'https://mega.nz/embed/abc');
assert.equal(servers.downloads.length, 1);
assert.equal(servers.downloads[0].quality, 'MP4 720p');
assert.equal(sh.cocok('https://v2.samehadaku.how/anime/a/'), true);
assert.equal(sh.cocok('https://otakudesu.blog/anime/a/'), false);
console.log('SEMUA UJI PARSER SAMEHADAKU LOLOS');
