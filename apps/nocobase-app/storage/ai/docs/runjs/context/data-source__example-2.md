---
title: "Get collections and fields Example"
description: "Extracted example from ctx.dataSource"
---

# ctx.dataSource

## Get collections and fields

```ts
const collections = ctx.dataSource.getCollections();

const users = ctx.dataSource.getCollection('users');
const primaryKey = users?.filterTargetKey ?? 'id';

const field = ctx.dataSource.getCollectionField('users.profile.avatar');
const userNameField = ctx.dataSource.getCollectionField('orders.createdBy.name');
```
