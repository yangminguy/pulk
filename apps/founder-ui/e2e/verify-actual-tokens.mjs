import { chromium } from '@playwright/test'
const BASE='http://localhost:3002', API='http://localhost:13000'
const token=(await fetch(`${API}/api/auth:signIn`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'admin@nocobase.com',password:'admin123'})}).then(r=>r.json())).data.token
const b=await chromium.launch({headless:true}); const ctx=await b.newContext({viewport:{width:1440,height:1100}})
await ctx.addInitScript(t=>{try{localStorage.setItem('l5_token',t)}catch{}},token)
const p=await ctx.newPage(); const errs=[]
p.on('pageerror',e=>errs.push(e.message))
await p.goto(BASE+'/control-room',{waitUntil:'networkidle',timeout:35000})
// scope to TINY Demo (business 98) if a selector exists
await p.waitForTimeout(1500)
const body=await p.evaluate(()=>document.body.innerText)
await p.screenshot({path:'/tmp/actual_tokens.png',fullPage:true})
console.log('사용 토큰 shown:', body.includes('사용 토큰'))
console.log('$0.34 cost shown:', body.includes('$0.34'))
console.log('errors:', errs.length, errs.slice(0,3))
await b.close()
