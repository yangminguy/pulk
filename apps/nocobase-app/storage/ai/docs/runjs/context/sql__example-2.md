---
title: "Template variables `{{ctx.xxx}}` Example"
description: "Extracted example from ctx.sql"
---

# ctx.sql

## Template variables `{{ctx.xxx}}`

```js
// Reference ctx.user.id
const user = await ctx.sql.run(
  'SELECT * FROM users WHERE id = {{ctx.user.id}}',
  { type: 'selectRow' }
);
```
