---
title: "Form: validate and refresh Example"
description: "Extracted example from ctx.blockModel"
---

# ctx.blockModel

## Form: validate and refresh

```ts
if (ctx.blockModel?.form) {
  await ctx.blockModel.form.validateFields();
  await ctx.blockModel.resource?.refresh?.();
}
```
