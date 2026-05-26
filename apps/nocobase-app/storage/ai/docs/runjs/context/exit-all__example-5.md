---
title: "Message then exit Example"
description: "Extracted example from ctx.exitAll()"
---

# ctx.exitAll()

## Message then exit

```ts
if (!isValidInput(ctx.form?.getValues?.())) {
  ctx.message.warning('Please fix form errors first');
  ctx.exitAll();
}
```
