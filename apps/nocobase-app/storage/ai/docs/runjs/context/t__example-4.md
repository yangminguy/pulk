---
title: "With interpolation Example"
description: "Extracted example from ctx.t()"
---

# ctx.t()

## With interpolation

```ts
const text = ctx.t('Hello {{name}}', { name: ctx.user?.nickname || 'Guest' });
ctx.render(`<div>${text}</div>`);
```
