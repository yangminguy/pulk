import { chromium } from '@playwright/test'
const FRONT='http://127.0.0.1:3002', API='http://localhost:13000'
const token=(await (await fetch(`${API}/api/auth:signIn`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account:'admin@nocobase.com',password:'admin123'})})).json())?.data?.token
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1500,height:1000}}); const p=await ctx.newPage()
await p.addInitScript(t=>localStorage.setItem('l5_token',t),token)
await p.goto(`${FRONT}/video-room`,{waitUntil:'networkidle'}); await p.waitForTimeout(1000)
await p.locator('button',{hasText:'전략 대화'}).first().click(); await p.waitForTimeout(2500)
console.log('상품 정의 시작 버튼:',(await p.locator('button',{hasText:'상품 정의 시작'}).count())>0)
console.log('(구)키 콘텐츠 기획 시작 버튼 잔존:',(await p.locator('button',{hasText:'키 콘텐츠 기획 시작'}).count())>0)
await p.screenshot({path:'/tmp/product-def-btn.png',fullPage:true})
await b.close()
