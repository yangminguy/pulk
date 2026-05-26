---
title: "POST request (with body) Example"
description: "Extracted example from APIResource"
---

# APIResource

## POST request (with body)

```js
const res = ctx.makeResource('APIResource');
res.setURL('/api/custom/submit');
res.setRequestMethod('post');
res.setRequestBody({ name: 'Test', type: 'report' });
await res.refresh();
const result = res.getData();
```
