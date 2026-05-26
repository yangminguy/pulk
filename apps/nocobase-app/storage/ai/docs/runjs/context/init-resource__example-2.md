---
title: "List data (MultiRecordResource) Example"
description: "Extracted example from ctx.initResource()"
---

# ctx.initResource()

## List data (MultiRecordResource)

```ts
ctx.initResource('MultiRecordResource');
ctx.resource.setResourceName('users');
await ctx.resource.refresh();
const rows = ctx.resource.getData();
ctx.render(<pre>{JSON.stringify(rows, null, 2)}</pre>);
```
