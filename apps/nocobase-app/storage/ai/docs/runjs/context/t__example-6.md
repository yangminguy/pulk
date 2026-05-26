---
title: "Relative time etc. Example"
description: "Extracted example from ctx.t()"
---

# ctx.t()

## Relative time etc.

```ts
if (minutes < 60) return ctx.t('{{count}} minutes ago', { count: minutes });
if (hours < 24) return ctx.t('{{count}} hours ago', { count: hours });
```
