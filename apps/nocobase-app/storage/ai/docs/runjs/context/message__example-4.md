---
title: "With ctx.t (i18n) Example"
description: "Extracted example from ctx.message"
---

# ctx.message

## With ctx.t (i18n)

```ts
ctx.message.success(ctx.t('Copied'));
ctx.message.warning(ctx.t('Please select at least one row'));
ctx.message.success(ctx.t('Exported {{count}} records', { count: rows.length }));
```
