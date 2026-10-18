// Uji alur klik: home → kartu → detail → episode → watch
const puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage();
  await p.setViewport({width:400,height:850});
  const errs=[];
  p.on('pageerror',e=>errs.push('pageerror: '+e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('console: '+m.text().slice(0,140)); });

  await p.goto('http://127.0.0.1:3000/#/home',{waitUntil:'domcontentloaded'});
  await wait(9000);
  // klik kartu rilisan terbaru pertama
  const clicked=await p.evaluate(()=>{
    const cards=[...document.querySelectorAll('.card[data-go="anime"]')];
    if(!cards.length) return 'tidak ada kartu';
    cards[0].click(); return location.hash;
  });
  console.log('klik kartu ->', clicked);
  await wait(9000);
  const detail=await p.evaluate(()=>({hash:location.hash, title:document.querySelector('.detail-head h1')?.textContent, eps:document.querySelectorAll('.ep-item').length}));
  console.log('detail:', JSON.stringify(detail));

  // klik episode pertama
  await p.evaluate(()=>{ const e=document.querySelector('.ep-item'); if(e) e.click(); });
  await wait(12000);
  const watch=await p.evaluate(()=>({
    hash:location.hash.slice(0,60),
    player:document.querySelector('.player-frame iframe')?'iframe':(document.querySelector('.player-frame video')?'video':'none'),
    servers:document.querySelectorAll('.server-chip').length,
    active:document.querySelector('.server-chip.active')?.textContent.trim().slice(0,30),
    title:document.querySelector('.watch-head h1')?.textContent
  }));
  console.log('watch:', JSON.stringify(watch));

  // ganti server ke yang terakhir
  await p.evaluate(()=>{ const c=[...document.querySelectorAll('.server-chip')]; if(c.length>1) c[c.length-1].click(); });
  await wait(6000);
  const afterSwitch=await p.evaluate(()=>({player:document.querySelector('.player-frame iframe')?'iframe':(document.querySelector('.player-frame video')?'video':'none'), active:document.querySelector('.server-chip.active')?.textContent.trim().slice(0,30)}));
  console.log('ganti server:', JSON.stringify(afterSwitch));

  console.log('\nERROR:', errs.length? [...new Set(errs)].join('\n') : 'tidak ada');
  await b.close();
})();
