---
title: "Multiple resources Example"
description: "Extracted example from ctx.makeResource()"
---

# ctx.makeResource()

## Multiple resources

```ts
const usersRes = ctx.makeResource('MultiRecordResource');
usersRes.setResourceName('users');
await usersRes.refresh();

const ordersRes = ctx.makeResource('MultiRecordResource');
ordersRes.setResourceName('orders');
await ordersRes.refresh();

ctx.render(
  <div>
    <p>Users: {usersRes.getData().length}</p>
    <p>Orders: {ordersRes.getData().length}</p>
  </div>
);
```
