---
title: "Create and pagination Example"
description: "Extracted example from MultiRecordResource"
---

# MultiRecordResource

## Create and pagination

```js
await ctx.resource.create({ name: 'John', email: 'john@example.com' });

await ctx.resource.next();
await ctx.resource.previous();
await ctx.resource.goto(3);
```
