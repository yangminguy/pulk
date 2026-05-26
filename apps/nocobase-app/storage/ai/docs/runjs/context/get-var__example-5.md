---
title: "Popup record Example"
description: "Extracted example from ctx.getVar()"
---

# ctx.getVar()

## Popup record

```ts
const recordId = await ctx.getVar('ctx.popup.record.id');
if (recordId) {
  ctx.message.info(`Popup record: ${recordId}`);
}
```
