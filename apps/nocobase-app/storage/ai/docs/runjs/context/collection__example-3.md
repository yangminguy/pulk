---
title: "Iterate fields for validation or linkage Example"
description: "Extracted example from ctx.collection"
---

# ctx.collection

## Iterate fields for validation or linkage

```ts
const fields = ctx.collection?.getFields() ?? [];
const requiredFields = fields.filter((f) => f.options?.required);
for (const f of requiredFields) {
  const v = ctx.form?.getFieldValue(f.name);
  if (v == null || v === '') {
    ctx.message.warning(`${f.title} is required`);
    return;
  }
}
```
