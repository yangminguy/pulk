---
title: "Delete record Example"
description: "Extracted example from SingleRecordResource"
---

# SingleRecordResource

## Delete record

```js
ctx.resource.setResourceName('users');
ctx.resource.setFilterByTk(1);
await ctx.resource.destroy();
// After destroy, getData() is null
```
