// 인스펙터로 워커 JS 스택 덤프 (행 지점 추적용, 1회 pause→resume)
import { WebSocket } from 'ws'
const url = process.argv[2]
const ws = new WebSocket(url)
let id = 0
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }))
ws.on('open', () => { send('Debugger.enable'); setTimeout(() => send('Debugger.pause'), 300) })
ws.on('message', (m) => {
  const j = JSON.parse(m.toString())
  if (j.method === 'Debugger.paused') {
    for (const f of j.params.callFrames.slice(0, 12)) {
      console.log(`${f.functionName || '(anon)'} @ ${f.url.split('/').slice(-3).join('/')}:${f.location.lineNumber}`)
    }
    send('Debugger.resume')
    setTimeout(() => process.exit(0), 300)
  }
})
setTimeout(() => { console.log('(no pause — event loop idle: 작업이 전부 await 대기 상태)'); process.exit(0) }, 6000)
