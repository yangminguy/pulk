---
title: "Current record id Example"
description: "Extracted example from ctx.getVar()"
---

# ctx.getVar()

## Current record id

```ts
const recordId = await ctx.getVar('ctx.record.id');
if (recordId) {
  ctx.message.info(`Current record: ${recordId}`);
}
```
