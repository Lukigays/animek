const puppeteer=require('puppeteer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
  const p=await b.newPage();
  await p.setViewport({width:400,height:850});
  const hits=[];
  p.on('response',r=>{
    const u=r.url();
    if(/googlevideo|\.mp4|\.m3u8|videoplayback|blogger\.com\/video/i.test(u)) hits.push(r.status()+' '+u.slice(0,120));
  });
  const hash='#/watch?src=samehadaku&slug=sousou-no-frieren-season-2&title=Frieren&poster=&num=1&url=https%3A%2F%2Fv2.samehadaku.how%2Fsousou-no-frieren-season-2-episode-1%2F';
  await p.goto('http://127.0.0.1:3000/'+hash,{waitUntil:'domcontentloaded'});
  await wait(25000);
  console.log('--- permintaan terkait video ---');
  console.log([...new Set(hits)].join('\n')||'tidak ada');
  await b.close();
})();
