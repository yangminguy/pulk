---
title: "Check association and use target collection Example"
description: "Extracted example from ctx.collectionField"
---

# ctx.collectionField

## Check association and use target collection

```ts
if (ctx.collectionField?.isAssociationField()) {
  const targetCol = ctx.collectionField.targetCollection;
  const titleField = targetCol?.titleCollectionField?.name;
  // ...
}
```
