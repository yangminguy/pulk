---
title: "dayjs (UMD) Example"
description: "Extracted example from ctx.requireAsync()"
---

# ctx.requireAsync()

## dayjs (UMD)

```javascript
const dayjs = await ctx.requireAsync('dayjs@1/dayjs.min.js');
console.log(dayjs?.default || dayjs);
```
