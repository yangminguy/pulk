---
title: "Write form values Example"
description: "Extracted example from ctx.form"
---

# ctx.form

## Write form values

```ts
// Batch update (e.g. linkage)
ctx.form.setFieldsValue({
  status: 'active',
  updatedAt: new Date(),
});

// Single field
ctx.form.setFieldValue('remark', 'Noted');
```
