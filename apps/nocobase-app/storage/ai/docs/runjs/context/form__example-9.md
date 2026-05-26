---
title: "Pre-submit validation Example"
description: "Extracted example from ctx.form"
---

# ctx.form

## Pre-submit validation

```ts
try {
  await ctx.form.validateFields();
  // Continue submit logic
} catch (e) {
  ctx.message.error('Please fix form errors');
  ctx.exit();
}
```
