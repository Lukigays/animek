const puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage();
  await p.setViewport({width:400,height:850});
  const hash='#/watch?src=samehadaku&slug=sousou-no-frieren-season-2&title=Frieren&poster=&num=1&url=https%3A%2F%2Fv2.samehadaku.how%2Fsousou-no-frieren-season-2-episode-1%2F';
  await p.goto('http://127.0.0.1:3000/'+hash,{waitUntil:'domcontentloaded'});
  await wait(18000);
  for (const f of p.frames()){
    const u=f.url();
    if(!/blogger|mega|filedon|file\.fm|wibu/.test(u)) continue;
    console.log('=== FRAME', u.slice(0,80));
    try{
      const info=await f.evaluate(()=>({
        videos:[...document.querySelectorAll('video')].map(v=>({src:(v.src||v.currentSrc||'').slice(0,90), rs:v.readyState})),
        buttons:[...document.querySelectorAll('button,[role=button],.play,[aria-label*=play i]')].map(x=>(x.textContent||x.getAttribute('aria-label')||'').trim().slice(0,30)).slice(0,6),
        body:document.body.innerHTML.length,
        text:document.body.innerText.slice(0,120)
      }));
      console.log(JSON.stringify(info,null,1));
      // coba klik play kalau ada video
      const clicked=await f.evaluate(()=>{ const v=document.querySelector('video'); if(v){v.play(); return 'play() dipanggil';} const btn=document.querySelector('[aria-label*=lay i],button'); if(btn){btn.click(); return 'klik '+ (btn.textContent||btn.getAttribute('aria-label'));} return 'tidak ada'; });
      console.log('aksi:',clicked);
    }catch(e){ console.log('  gagal evaluasi:', e.message.slice(0,80)); }
  }
  await wait(8000);
  await b.close();
})();
