// 9222 CDP 크롬 모든 창을 화면에서 숨김: -4000px 이동 후 최소화(minimized).
// 크롤링은 Runtime.evaluate(DOM)이라 minimized에서도 동작. 스크린샷 필요 시만 일시 normal.
const PORT = process.env.CDP_PORT || 9222;
function connect(u){return new Promise((res,rej)=>{const ws=new WebSocket(u);let id=0;const pend=new Map();const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});ws.addEventListener('open',()=>res({ws,send}));ws.addEventListener('error',rej);setTimeout(()=>rej(new Error('ws timeout')),3000);});}
try{
  const list=await(await fetch(`http://localhost:${PORT}/json/list`)).json();
  const seen=new Set(); let hid=0;
  for(const p of list.filter(t=>t.type==='page')){
    try{const{ws,send}=await connect(p.webSocketDebuggerUrl);const w=await send('Browser.getWindowForTarget');const wid=w.result?.windowId;
      if(wid&&!seen.has(wid)){seen.add(wid);
        await send('Browser.setWindowBounds',{windowId:wid,bounds:{left:-4000,top:0,width:1280,height:900,windowState:'normal'}});
        await send('Browser.setWindowBounds',{windowId:wid,bounds:{windowState:'minimized'}});
        hid++;}
      ws.close();}catch(e){}
  }
  console.log(`hid ${hid} window(s) (offscreen+minimized)`);
}catch(e){ console.log('hide skip:', e.message); }
