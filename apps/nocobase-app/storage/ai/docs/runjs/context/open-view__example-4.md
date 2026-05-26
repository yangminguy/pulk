---
title: "Open via runAction Example"
description: "Extracted example from ctx.openView()"
---

# ctx.openView()

## Open via runAction

```ts
await ctx.runAction('openView', {
  navigation: false,
  mode: 'dialog',
  collectionName: 'users',
  filterByTk: ctx.record?.id,
});
```
