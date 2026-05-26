---
title: "Field linkage by type Example"
description: "Extracted example from ctx.form"
---

# ctx.form

## Field linkage by type

```ts
const type = ctx.form.getFieldValue('type');
if (type === 'vip') {
  ctx.form.setFieldsValue({ discount: 0.8 });
} else {
  ctx.form.setFieldsValue({ discount: 1 });
}
```
