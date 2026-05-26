---
title: "save without auto refresh Example"
description: "Extracted example from SingleRecordResource"
---

# SingleRecordResource

## save without auto refresh

```js
await ctx.resource.save({ status: 'active' }, { refresh: false });
// After save, no refresh; getData() keeps previous value
```
