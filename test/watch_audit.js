const puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage();
  await p.setViewport({width:400,height:850});
  const hash='#/watch?src=samehadaku&slug=sousou-no-frieren-season-2&title=Frieren&poster=&num=1&url=https%3A%2F%2Fv2.samehadaku.how%2Fsousou-no-frieren-season-2-episode-1%2F';
  await p.goto('http://127.0.0.1:3000/'+hash,{waitUntil:'domcontentloaded'});
  for (let i=1;i<=8;i++){
    await wait(5000);
    const st=await p.evaluate(()=>{
      const f=document.querySelector('.player-frame iframe, .player-frame video');
      const active=document.querySelector('.server-chip.active');
      return {tag:f?.tagName||null, src:(f?.src||f?.currentSrc||'').slice(0,70), active:active?.textContent.trim().slice(0,30), overlay:document.querySelector('.player-overlay')?.textContent.slice(0,60)||null};
    });
    console.log(i*5+'s', JSON.stringify(st));
  }
  await b.close();
})();
