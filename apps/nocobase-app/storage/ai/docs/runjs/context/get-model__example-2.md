---
title: "Get another block and refresh Example"
description: "Extracted example from ctx.getModel()"
---

# ctx.getModel()

## Get another block and refresh

```ts
const block = ctx.getModel('list-block-uid');
if (block?.resource) {
  await block.resource.refresh();
}
```
