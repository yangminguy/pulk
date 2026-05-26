---
title: "Confirm then submit Example"
description: "Extracted example from ctx.form"
---

# ctx.form

## Confirm then submit

```ts
const confirmed = await ctx.modal.confirm({
  title: 'Confirm submit',
  content: 'Cannot be changed after submit. Continue?',
  okText: 'OK',
  cancelText: 'Cancel',
});
if (confirmed) {
  await ctx.form.validateFields();
  ctx.form.submit();
} else {
  ctx.exit();
}
```
