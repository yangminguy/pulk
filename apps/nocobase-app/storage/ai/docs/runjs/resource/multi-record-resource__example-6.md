---
title: "Listen to refresh event Example"
description: "Extracted example from MultiRecordResource"
---

# MultiRecordResource

## Listen to refresh event

```js
ctx.resource?.on?.('refresh', () => {
  const data = ctx.resource.getData();
  ctx.render(<ul>{data?.map((r) => <li key={r.id}>{r.name}</li>)}</ul>);
});
await ctx.resource?.refresh?.();
```
