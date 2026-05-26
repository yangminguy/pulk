---
title: "Close current view Example"
description: "Extracted example from ctx.view"
---

# ctx.view

## Close current view

```ts
await ctx.resource.runAction('create', { data: formData });
ctx.view?.close();

ctx.view?.close({ id: newRecord.id, name: newRecord.name });
```
