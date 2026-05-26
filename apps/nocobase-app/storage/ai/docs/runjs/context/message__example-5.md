---
title: "Loading and manual close Example"
description: "Extracted example from ctx.message"
---

# ctx.message

## Loading and manual close

```ts
const hide = ctx.message.loading(ctx.t('Saving...'));
await saveData();
hide();
ctx.message.success(ctx.t('Saved'));
```
