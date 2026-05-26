---
title: "Association resource (e.g. users.profile) Example"
description: "Extracted example from SingleRecordResource"
---

# SingleRecordResource

## Association resource (e.g. users.profile)

```js
const res = ctx.makeResource('SingleRecordResource');
res.setResourceName('users.profile');
res.setSourceId(ctx.record?.id); // Parent record primary key
res.setFilterByTk(profileId);    // Can omit filterByTk if profile is hasOne
await res.refresh();
const profile = res.getData();
```
