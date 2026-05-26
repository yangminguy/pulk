---
title: "Write current field when linking others Example"
description: "Extracted example from ctx.setValue()"
---

# ctx.setValue()

## Write current field when linking others

```ts
const otherValue = ctx.form?.getFieldValue('type');
if (otherValue === 'custom') {
  ctx.setValue?.({ label: 'Custom', value: 'custom' });
}
```
