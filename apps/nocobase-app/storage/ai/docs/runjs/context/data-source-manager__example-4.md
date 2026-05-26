---
title: "Field by full path Example"
description: "Extracted example from ctx.dataSourceManager"
---

# ctx.dataSourceManager

## Field by full path

```ts
// Format: dataSourceKey.collectionName.fieldPath
const field = ctx.dataSourceManager.getCollectionField('main.users.profile.avatar');

const userNameField = ctx.dataSourceManager.getCollectionField('main.orders.createdBy.name');
```
