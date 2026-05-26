---
title: "Form field value Example"
description: "Extracted example from ctx.getVar()"
---

# ctx.getVar()

## Form field value

```ts
const status = await ctx.getVar('ctx.formValues.status');
if (status === 'draft') {
  // ...
}
```
