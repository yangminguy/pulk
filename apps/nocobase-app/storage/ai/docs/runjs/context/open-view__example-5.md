---
title: "Inject custom context Example"
description: "Extracted example from ctx.openView()"
---

# ctx.openView()

## Inject custom context

```ts
await ctx.openView(`${ctx.model.uid}-edit`, {
  mode: 'drawer',
  filterByTk: ctx.record?.id,
  defineProperties: {
    onSaved: {
      get: () => () => ctx.resource?.refresh?.(),
      cache: false,
    },
  },
});
```
