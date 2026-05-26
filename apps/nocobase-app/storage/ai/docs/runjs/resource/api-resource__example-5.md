---
title: "Error handling Example"
description: "Extracted example from APIResource"
---

# APIResource

## Error handling

```js
const res = ctx.makeResource('APIResource');
res.setURL('/api/may-fail');
try {
  await res.refresh();
  const data = res.getData();
} catch (e) {
  const err = res.getError();
  ctx.message.error(err?.message ?? 'Request failed');
}
```
