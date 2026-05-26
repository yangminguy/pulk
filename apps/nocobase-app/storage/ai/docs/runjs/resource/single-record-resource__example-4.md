---
title: "Association expansion and fields Example"
description: "Extracted example from SingleRecordResource"
---

# SingleRecordResource

## Association expansion and fields

```js
ctx.resource.setResourceName('users');
ctx.resource.setFilterByTk(1);
ctx.resource.setFields(['id', 'nickname', 'email']);
ctx.resource.setAppends(['profile', 'roles']);
await ctx.resource.refresh();
const user = ctx.resource.getData();
```
