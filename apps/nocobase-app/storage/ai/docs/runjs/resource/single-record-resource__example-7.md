---
title: "Listen to refresh / saved events Example"
description: "Extracted example from SingleRecordResource"
---

# SingleRecordResource

## Listen to refresh / saved events

```js
ctx.resource?.on?.('refresh', () => {
  const data = ctx.resource.getData();
  ctx.render(<div>User: {data?.nickname}</div>);
});
ctx.resource?.on?.('saved', (savedData) => {
  ctx.message.success('Saved');
});
await ctx.resource?.refresh?.();
```
