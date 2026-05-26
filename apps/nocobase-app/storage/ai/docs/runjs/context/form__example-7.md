---
title: "Compute current field from others Example"
description: "Extracted example from ctx.form"
---

# ctx.form

## Compute current field from others

```ts
const quantity = ctx.form.getFieldValue('quantity') ?? 0;
const price = ctx.form.getFieldValue('price') ?? 0;
ctx.setValue(quantity * price);
```
