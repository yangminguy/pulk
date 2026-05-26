---
title: "Read current language Example"
description: "Extracted example from ctx.i18n"
---

# ctx.i18n

## Read current language

```ts
const lang = ctx.i18n.language;
if (lang.startsWith('zh')) {
  ctx.render(ctx.t('Chinese UI'));
} else {
  ctx.render(ctx.t('English UI'));
}
```
