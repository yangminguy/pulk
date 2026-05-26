---
title: "Basic: open drawer Example"
description: "Extracted example from ctx.openView()"
---

# ctx.openView()

## Basic: open drawer

```ts
const popupUid = `${ctx.model.uid}-detail`;
await ctx.openView(popupUid, {
  mode: 'drawer',
  size: 'medium',
  title: ctx.t('Detail'),
});
```
