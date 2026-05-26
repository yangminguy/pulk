---
title: "Get association fields Example"
description: "Extracted example from ctx.collection"
---

# ctx.collection

## Get association fields

```ts
const oneToMany = ctx.collection?.getAssociationFields(['many']) ?? [];
// For sub-tables, association resources, etc.
```
