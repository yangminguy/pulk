---
title: "Create record Example"
description: "Extracted example from SingleRecordResource"
---

# SingleRecordResource

## Create record

```js
const newRes = ctx.makeResource('SingleRecordResource');
newRes.setResourceName('users');
await newRes.save({ name: 'Bob', email: 'bob@example.com' });
```
