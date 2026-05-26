---
title: "Title field of target collection Example"
description: "Extracted example from ctx.collectionField"
---

# ctx.collectionField

## Title field of target collection

```ts
const titleField = ctx.collectionField?.targetCollectionTitleField;
const titleKey = titleField?.name ?? 'title';
const assocValue = ctx.getValue?.() ?? ctx.record?.[ctx.collectionField?.name];
const label = assocValue?.[titleKey];
```
