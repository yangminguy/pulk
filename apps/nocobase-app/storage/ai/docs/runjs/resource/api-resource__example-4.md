---
title: "Listen to refresh event Example"
description: "Extracted example from APIResource"
---

# APIResource

## Listen to refresh event

```js
const res = ctx.makeResource('APIResource');
res.setURL('/api/stats');
res.on('refresh', () => {
  const data = res.getData();
  ctx.render(<div>Stats: {JSON.stringify(data)}</div>);
});
await res.refresh();
```
