---
title: "Example Example"
description: "Extracted example from ctx.getVar()"
---

# ctx.getVar()

## Example

```ts
const vars = await ctx.getVarInfos({ path: 'record', maxDepth: 3 });

const vars = await ctx.getVarInfos({ path: 'popup.record', maxDepth: 3 });

const vars = await ctx.getVarInfos();
```
