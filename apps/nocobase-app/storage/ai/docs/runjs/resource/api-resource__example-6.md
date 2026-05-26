---
title: "Custom headers Example"
description: "Extracted example from APIResource"
---

# APIResource

## Custom headers

```js
const res = ctx.makeResource('APIResource');
res.setURL('https://api.example.com/data');
res.addRequestHeader('X-Custom-Header', 'value');
res.addRequestParameter('key', 'xxx');
await res.refresh();
```
