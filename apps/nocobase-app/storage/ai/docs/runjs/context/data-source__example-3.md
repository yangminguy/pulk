---
title: "Get association field Example"
description: "Extracted example from ctx.dataSource"
---

# ctx.dataSource

## Get association field

```ts
const rolesField = ctx.dataSource.getAssociation('users.roles');
if (rolesField?.isAssociationField()) {
  const targetCol = rolesField.targetCollection;
  // ...
}
```
