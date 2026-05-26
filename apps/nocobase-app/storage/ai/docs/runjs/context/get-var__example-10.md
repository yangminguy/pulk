---
title: "Explore variables Example"
description: "Extracted example from ctx.getVar()"
---

# ctx.getVar()

## Explore variables

```ts
const vars = await ctx.getVarInfos({ path: 'record', maxDepth: 3 });
// e.g. { 'record.id': { type: 'string', title: 'id' }, ... }
```
